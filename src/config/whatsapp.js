process.on('uncaughtException', async (err, origin) => {
    console.log('error', err)
})

require('dotenv').config()

const {
    default: makeWASocket,
    DisconnectReason,
    Browsers,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const P = require('pino')
const path = require('node:path')
const fs = require('node:fs')
const { Boom } = require('@hapi/boom')

const logger = P().child({
    level: 'silent',
    stream: 'store'
})

const store = makeInMemoryStore({
    logger
})

const { 
    UserHandler, 
    ProductHandler,
    OrderHandler,
    CheckoutHandler,
    V2OrderHandler,
    TokoVoucherHandler
} = require(
    path.resolve('src/handler/index.js')
)

const { Helper } = require(
    path.resolve('src/helpers/index.js')
)

var _sock = {};

async function connectToWhatsApp(sessions) {
    const { state, saveCreds } = await useMultiFileAuthState(sessions)
    
    const sock = makeWASocket({
        logger,
        printQRInTerminal: true,
        retryRequestDelayMs: 5000,
        qrTimeout: 10000,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
        browser: Browsers.macOS('Desktop'),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        }
    });

    _sock = sock
    
    store.bind(sock.ev)

    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`[*] Using WA v${version.join('.')}, isLatest: ${isLatest}`)
    
    sock.ev.on('creds.update', saveCreds)
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update

        if (connection) logger.info("Connection Status: ", connection)

        let reason = new Boom(lastDisconnect?.error)?.output?.statusCode

        if(connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('[*] Connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect)
            
            if (reason === DisconnectReason.badSession) {
                console.log(`[*] Bad Session, Please Scan Again!`)
                fs.readdir(`./${sessions}`, (_, files) => {
                    files.forEach(file => {
                        fs.unlinkSync(`./${sessions}/${file}`)
                    })
                    
                    fs.rmdirSync(`./${sessions}`)
                })
                await connectToWhatsApp(sessions)
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("[*] Connection closed, reconnecting....");
                await connectToWhatsApp(sessions)
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("[*] Connection Lost from Server, reconnecting...");
                await connectToWhatsApp(sessions)
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("[*] Connection Replaced, Another New Session Opened, Please Close Current Session First");
                process.exit()
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`[*] Device Logged Out, Please Scan Again.`)
                fs.readdir(`./${sessions}`, (_, files) => {
                    files.forEach(file => {
                        fs.unlinkSync(`./${sessions}/${file}`)
                    })
                    fs.rmdirSync(`./${sessions}`)
                })
                await connectToWhatsApp(sessions)
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("[*] Restart Required, Restarting...");
                await connectToWhatsApp(sessions)
            } else if (reason === DisconnectReason.timedOut) {
                console.log("[*] Connection TimedOut, Reconnecting...");
                await connectToWhatsApp(sessions)
            } else {
                console.log(`[*] Unknown DisconnectReason: ${reason}: ${connection}`);
                await connectToWhatsApp(sessions)
            }
        } else if(connection === 'open') {
            console.log('[*] Opened connection')
        }
    })

    // message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        var conversation;
        var { ADMIN } = process.env
        ADMIN = eval(ADMIN)

        const m = messages[0]
        sock.session = sock.session ? sock.session : {}
        
        if (!m.message) return // if there is no text or media message
        
        const remoteJid = m?.key?.remoteJid
        
        const TOKOVOUCHER = Helper.toBoolean(process.env.TOKOVOUCHER)
        const TOKOPAY = Helper.toBoolean(process.env.TOKOPAY)
        const DEBUG   = Helper.toBoolean(process.env.DEBUG)

        const messageType = Object.keys (m.message)[0] 
        const isGroup = remoteJid.split('@')[1] === 'g.us'

        await sock.readMessages([m.key])
        
        conversation = messageType === 'conversation' ? m?.message?.conversation : (messageType === 'imageMessage' ? m?.message?.imageMessage?.caption : m?.message?.extendedTextMessage?.text)

        if (DEBUG) {
            console.log(`[${messageType}] conversation from ${remoteJid}:`, (conversation || 'media message can\'t be showing in terminal'))
            console.log('sock.session',
                JSON.stringify(sock?.session, null, 2)
            )
            console.log('m:', JSON.stringify(m, null, 2))
        } 

        if (!isGroup && (messageType === 'conversation' || messageType === 'extendedTextMessage' || messageType === 'imageMessage')) {
            m.isAdmin = ADMIN.includes(remoteJid.split('@')[0]) 
            sock.session[remoteJid]              = sock.session[remoteJid]              ? sock.session[remoteJid]              : {}
            sock.session['order_ids']            = sock.session['order_ids']            ? sock.session['order_ids']            : []
            sock.session[remoteJid]['total']     = sock.session[remoteJid]['total']     ? sock.session[remoteJid]['total']     : 0
            sock.session[remoteJid]['pending']   = sock.session[remoteJid]['pending']   ? sock.session[remoteJid]['pending']   : true
            sock.session[remoteJid]['quoted']    = sock.session[remoteJid]['quoted']    ? sock.session[remoteJid]['quoted']    : {}
            sock.session[remoteJid]['sessions']  = sock.session[remoteJid]['sessions']  ? sock.session[remoteJid]['sessions']  : {}
            sock.session[remoteJid]['trx_ids']   = sock.session[remoteJid]['trx_ids']   ? sock.session[remoteJid]['trx_ids']   : {}
            sock.session[remoteJid]['carts']     = sock.session[remoteJid]['carts']     ? sock.session[remoteJid]['carts']     : []
            sock.session[remoteJid]['cart']      = sock.session[remoteJid]['cart']      ? sock.session[remoteJid]['cart']      : {}
            sock.session[remoteJid]['key_react'] = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : null

            UserHandler(sock, m, conversation, remoteJid, logger, messageType)
            ProductHandler(sock, m, conversation, remoteJid)
            OrderHandler(sock, m, conversation, remoteJid, logger, messageType)
            CheckoutHandler(sock, m, conversation, remoteJid, logger, messageType)
            V2OrderHandler(sock, m, conversation, remoteJid, logger, messageType)

            if (!!TOKOVOUCHER) {
                TokoVoucherHandler(sock, m, conversation, remoteJid, logger, messageType)
            }
            // if (m.isAdmin) {              
            // }
        }
    })

    sock.ev.on('call', async ({ from }) => {
        const CALL_AUTOBLOCK = Helper.toBoolean(process.env.CALL_AUTOBLOCK)
        const DEBUG = Helper.toBoolean(process.env.DEBUG)

        if (DEBUG) {
            console.log('call event', from)
        } 

        if (CALL_AUTOBLOCK) {
            await sock.sendMessage(from, { text: 'Mohon maaf bot tidak dapat menerima panggilan, nomor Anda kami block.' })
            setTimeout(async() => {
                await sock.updateBlockStatus(from, "block")
            }, 2_000)
        }
    })

    return new Promise(resolve => {
        resolve({
            sock: sock,
        })
    })
}

module.exports = {
    connectToWhatsApp,
    sock: _sock,
}