process.on('uncaughtException', async (err, origin) => {
    console.log('error [user handler]', err)
});

require('dotenv').config()

const path = require('node:path')
const fs = require('node:fs')
const { writeFile } = require('fs/promises')

const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { User, Cart, Order } = require(path.resolve('src/models/index'))
const { Helper } = require(path.resolve('src/helpers/index.js'))
const { createAdvancedOrder } = require(path.resolve('src/config/tokopay.js'))
const { createInvoice } = require(path.resolve('src/config/pdfkit.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { emitter } = require(path.resolve('src/config/emitter.js'))
const { queue, Sock } = require(path.resolve('src/config/queue.js'))

const UserModel  = new User()
const CartModel  = new Cart()
const OrderModel = new Order()

const handler = async (sock, m, conversation, remoteJid, logger, messageType) => {
    Sock.sock = sock
    var phone    = remoteJid.split('@')[0]
    var pushName = m?.pushName || '-'

    var { 
        ADMIN, 
        TOKOVOUCHER, 
        TOKOPAY,
        TOKOPAY_MERCHANT_ID,
        TOKOPAY_SECRET_KEY
    } = process.env

    TOKOVOUCHER = Helper.toBoolean(TOKOVOUCHER)
    TOKOPAY = Helper.toBoolean(TOKOPAY)

    var user  = await UserModel.findOne(phone)
    
    if (!user){
        user = await UserModel.create({
            number: phone,
            pushName,
            saldo: 0,
        })
    }

    emitter.on(`deposit-${remoteJid}`, ({ remoteJid: _remoteJid }) => {
        sock.session[_remoteJid]['carts'] = []
        sock.session[_remoteJid]['cart']['deposit'] = []
        sock.session[_remoteJid]['sessions']['deposit'] = false
        sock.session[_remoteJid]['trx_ids']['deposit']  = null
        setTimeout(() => {
            emitter.off(`deposit-${_remoteJid}`)
        })
    })

    var checkout_session    = sock.session[remoteJid]['sessions']['checkout']    ? sock.session[remoteJid]['sessions']['checkout']    : false
    var v2order_session     = sock.session[remoteJid]['sessions']['v2order']     ? sock.session[remoteJid]['sessions']['v2order']     : false
    var tokovoucher_session = sock.session[remoteJid]['sessions']['tokovoucher'] ? sock.session[remoteJid]['sessions']['tokovoucher'] : false
    var deposit_session     = sock.session[remoteJid]['sessions']['deposit']     ? sock.session[remoteJid]['sessions']['deposit']     : false
    var cart_deposit        = sock.session[remoteJid]['cart']['deposit']         ? sock.session[remoteJid]['cart']['deposit']         : []

    switch (true) {
        case (/\/menu$/i.test(conversation)):
            if (TOKOVOUCHER && TOKOPAY) {
                var response = `(̶◉͛‿◉̶) *LIST MENU* (>‿◠)✌\n\n---------------\nSelamat datang, ${pushName}!\n\nSaldo kamu saat ini: ${user.saldo}\n---------------\n\nツ *Main Menu*\n| /owner\n| /profile\n| /ceksaldo${m.isAdmin ? '\n| /isisaldo\n| /deposit' : '\n| /deposit'}\n\nツ *Order Menu*\n| /listorder\n| /cart\n| /v2order\n| /checkout\n\nツ *Product Menu*\n| /listproduk\n| /addproduk\n| /updateproduk\n| /delproduk\n\nツ *Toko Voucher Menu*\n| /topup-game\n| /voucher-game\n| /hiburan\n| /pulsa\n| /paket-data\n| /voucher-data\n| /pln\n| /e-money\n| /tv\n| /masa-aktif\n| /pascabayar\n| /e-toll\n| /tokovoucher cancel\n\nツ *Action Menu*${m.isAdmin ? '\n| /acceptorder\n| /declineorder\n| /acceptdeposit\n| /declinedeposit' : '\n| /konfirmasideposit\n| /konfirmasiorder'}\n\n© 2023. Powered by aex-bot\n✎ *ibnusyawall | @isywl_*`
            } else {
                var response = `(̶◉͛‿◉̶) *LIST MENU* (>‿◠)✌\n\n---------------\nSelamat datang, ${pushName}!\n\nSaldo kamu saat ini: ${user.saldo}\n---------------\n\nツ *Main Menu*\n| /owner\n| /profile\n| /ceksaldo${m.isAdmin ? '\n| /isisaldo' : '\n| /deposit'}\n\nツ *Order Menu*\n| /listorder\n| /cart\n| /v2order\n\nツ *Product Menu*\n| /listproduk\n| /addproduk\n| /updateproduk\n| /delproduk\n\nツ *Action Menu*${m.isAdmin ? '\n| /acceptorder\n| /declineorder\n| /acceptdeposit\n| /declinedeposit' : '\n| /konfirmasideposit\n| /konfirmasiorder'}\n\n© 2023. Powered by aex-bot\n✎ *ibnusyawall | @isywl_*`
            }

            await Sock.sendTextMessage(remoteJid, { text: response })
            break;
        case ((/\/tokovoucher/i.test(conversation)) && conversation.startsWith('/tokovoucher')): { 
            if (conversation.split(' ')[1] == 'cancel') {
                var orders = await CartModel.find({
                    user_id: user._id,
                    type: 'tokovoucher',
                    confirmed: false,
                    order_id: null,
                    type_checkout: 'single'
                })

                if (orders.length > 0) {
                    orders.map( async ({ _id: cart_id }) => {
                        await CartModel.destroy(cart_id)
                    })
                }

                setTimeout(async () => {
                    response = 'Sesi *tokovoucher* berhasil dibatalkan.'
                    await Sock.sendTextMessage(remoteJid, { text: response })

                    sock.session[remoteJid]['carts'] = []
                    sock.session[remoteJid]['cart']['tokovoucher'] = []
                    sock.session[remoteJid]['sessions']['tokovoucher'] = false
                    sock.session[remoteJid]['trx_ids']['tokovoucher']  = null
                })
            }
            break;
        }
        case (/\/owner$/i.test(conversation)):
            var owner  = await UserModel.findOne(process.env.ADMIN)
            var response = `*OWNER*\n\nNAMA: ${owner.pushName}\nNOMOR: ${owner.number}`
            await Sock.sendTextMessage(remoteJid, { text: response })
            break;
        case (/\/profile$/i.test(conversation)): 
            var response = `*PROFILE*\n\nNAMA: ${pushName}\nNOMOR: ${phone}\nSALDO: ${user.saldo}`
            await Sock.sendTextMessage(remoteJid, { text: response })
            break;
        case (/\/ceksaldo$/i.test(conversation)): 
            var response = `DETAIL ACCOUNT *${pushName}*\n\n- Number: ${phone}\n- Saldo: ${user?.saldo || '0'}`
            await Sock.sendTextMessage(remoteJid, { text: response })
            break;
        case ((/\/isisaldo/i.test(conversation)) && conversation.startsWith('/isisaldo')): {
            if (m.isAdmin) {
                var response;
                
                if (conversation.split(' ').length < 3) {
                    response = 'Format isi saldo tidak sesuai!\n\nContoh: */isisaldo 6282299265151 20000*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (isNaN(+conversation.split(' ')[2])) {
                    response = 'Format isi saldo harus berupa nominal angka!\n\nContoh: */isisaldo 6282299265151 20000*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var total_saldo = (+conversation.split(' ')[2] + +user.saldo)

                    await UserModel.update(phone, {
                        saldo: total_saldo
                    })

                    response = `Deposit saldo berhasil!\n\nNomor: ${conversation.split(' ')[1]}\nNominal: ${conversation.split(' ')[2]}\nTotal: ${total_saldo}`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }

                return
            } else {
                let response = `Silahkan konfirmasi kepada owner untuk mengisi saldo!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break;
        case ((/\/deposit/i.test(conversation)) && conversation.startsWith('/deposit')): { 
            if (conversation.split(' ').length < 2) {
                response = 'Format deposit tidak sesuai!\n\nContoh: */deposit 20000*'
                await Sock.sendTextMessage(remoteJid, { text: response })
            } else {
                if (conversation.split(' ')[1] == 'cancel' && isNaN(+conversation.split(' ')[1])) {
                    var orders = await CartModel.find({
                        user_id: user._id,
                        type: 'deposit',
                        confirmed: false
                    })
    
                    if (orders.length > 0) {
                        orders.map( async ({ _id: cart_id }) => {
                            await CartModel.destroy(cart_id)
                        })
                    }
    
                    setTimeout( async () => {
                        response = 'Sesi *deposit* berhasil dibatalkan.'
                        await Sock.sendTextMessage(remoteJid, { text: response })
    
                        sock.session[remoteJid]['carts'] = []
                        sock.session[remoteJid]['cart']['deposit'] = []
                        sock.session[remoteJid]['sessions']['deposit'] = false
                        sock.session[remoteJid]['trx_ids']['deposit']  = null
                    })
                } else if (conversation.split(' ')[1] != 'cancel' && isNaN(+conversation.split(' ')[1])) {
                    response = 'Format deposit harus berupa nominal angka!\n\nContoh: */deposit 20000*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (conversation.split(' ')[1] != 'cancel' && +conversation.split(' ')[1] < 100) {
                    response = 'Minimum deposit adalah 100!'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    if (deposit_session || (cart_deposit).length === 1) {
                        response = 'Sesi *deposit* kamu masih aktif atau terdapat sesi lainnya yang masih aktif. Pastikan kamu sudah memilih metode pembayaran yang tersedia dan segera melakukan pembayaran.\n\nNotes:\n* Harap untuk menunggu 5 menit untuk menggunakan command ini selanjutnya.\n* Ketik */deposit cancel* untuk membatalkan sesi deposit sebelumnya.'
                        await Sock.sendTextMessage(remoteJid, { text: response })
                    } else {
                        sock.session[remoteJid]['sessions']['deposit'] = true
    
                        var orders = await CartModel.find({
                            user_id: user._id,
                            type: 'deposit',
                            confirmed: false
                        })
        
                        if (orders.length > 0) {
                            orders.map( async ({ _id: cart_id }) => {
                                await CartModel.destroy(cart_id)
                            })
                        }
        
                        var cart = await CartModel.create({
                            id_tujuan: phone,
                            user_id: user._id,
                            type: 'deposit',
                            pending: true,
                            confirmed: false,
                            nominal: +conversation.split(' ')[1],
                            type_checkout: 'single',
                        })
                        
                        if (TOKOPAY){
                            var _trx_id = sock.session[remoteJid]['trx_ids']['deposit'] ? sock.session[remoteJid]['trx_ids']['deposit'] : Helper.generateTrxId()
        
                            sock.session[remoteJid]['trx_ids']['deposit']  = _trx_id
        
                            await CartModel.update(cart._id, {
                                trx_id: sock.session[remoteJid]['trx_ids']['deposit'],
                                temporary: true
                            })
        
                            var channelPayment = {
                                'GOPAY': '3.00%',
                                'QRIS': 'Rp100 + 0.70%',
                                'QRISREALTIME': '1.70%',
                            }
        
                            response = 'Silahkan balas pesan dengan metode pembayaran dibawah:\n'
        
                            Object.keys(channelPayment).map((key, index) => {
                                response += `\n${index+1}. ${key}`
                            })
        
                            response += `\n\nContoh balas dengan: QRIS`
        
                            await sock.sendMessage(remoteJid, { text: response })
                            
                            sock.session[remoteJid]['total'] = cart.nominal
                            sock.session[remoteJid]['carts'] = [
                                {
                                    product_code: 'DEPOSIT',
                                    name: `Deposit Saldo`,
                                    price: cart.nominal, 
                                    product_url: 'https://product.com', 
                                    image_url: 'https://image.com' 
                                }
                            ]

                            sock.session[remoteJid]['cart']['deposit'] = sock.session[remoteJid]['carts']
                        } else {
                            response = `Halo ${pushName},\n\nBerikut data deposit yang akan kamu order:\n\nNominal: ${conversation.split(' ')[1]}\n\nHarap untuk membayar sesuai nominal tertera, pembayaran dilakukan dengan Qris diatas.\n\nOh iya, jangan lupa kirim bukti screenshot transfer dengan caption */konfirmasideposit* jika kamu sudah membayar, ya! Agar admin/ owner segera mengirimkan saldo ke akun kamu!`
                            await sock.sendMessage(remoteJid, {
                                image: fs.readFileSync('./public/qris.jpg'),
                                caption: response
                            })
                        }
    
                        setTimeout(() => {
                            sock.session[remoteJid]['carts'] = []
                            sock.session[remoteJid]['cart']['deposit']  = []
                            sock.session[remoteJid]['sessions']['deposit'] = false
                            sock.session[remoteJid]['trx_ids']['deposit']  = null
                        }, 300_000); // 5 menit
                    }
                }
            }
        }
            break;
        case (/\/konfirmasideposit$/i.test(conversation)):
            var response;

            if (messageType === 'imageMessage') {
                var orders = await OrderModel.find({
                    user_id: user._id,
                    type: 'deposit',
                })
    
                orders = orders.filter(({ confirmed, type, user_id }) => !confirmed && type === 'deposit' && user_id === user._id)
    
                if (orders.length > 0) {
                    const buffer = await downloadMediaMessage(
                        m,
                        'buffer',
                        { },
                        { 
                            logger,
                            reuploadRequest: sock.updateMediaMessage
                        }
                    )
    
                    var { _id: order_id, nominal } = orders[0]
    
                    // save to file
                    await writeFile(`./public/orders/bukti-tf-${order_id}.jpg`, buffer)
    
                    response = `Halo Admin,\n\n${phone} telah melakukan konfirmasi terkait pembayaran deposit:\n\nNomor: ${phone}\nNominal: *${nominal}*\n\nHarap untuk periksa kembali konfirmasi pembayaran tersebut.\n\nApa yang dapat dilakukan?\n\nKetik */acceptdeposit ${order_id}* untuk meng-konfirmasi pembayaran berhasil, dan\nKetik */declinedeposit ${order_id}* untuk meng-konfirmasi pembayaran ditolak.`
                    await sock.sendMessage(`${ADMIN}@s.whatsapp.net`, {
                        image: fs.readFileSync(`./public/orders/bukti-tf-${order_id}.jpg`),
                        caption: response
                    }, {
                        quoted: m
                    })
                    
                    response = `Pembayaran produk dengan nomor order *#${order_id}* berhasil diteruskan ke admin/ owner. Mohon untuk menunggu konfirmasi dari admin untuk melakukan pengecekan pembayaran kamu, ya!\n\nNb: Saldo deposit akan segera dikirimkan bila admin/ owner berhasil men-setujui pembayaran kamu.`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    response = `Sayangnya kami tidak dapat menemukan order deposit kamu.`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }
            } else {
                var orders = await OrderModel.find({
                    user_id: user._id,
                    type: 'deposit',
                })

                orders = orders.filter(({ confirmed, type, user_id }) => !confirmed && type === 'deposit' && user_id === user._id)
    
                if (orders.length > 0) {
                    response = `Harap sertakan gambar bukti transfer!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    response = `Sayangnya kami tidak dapat menemukan order deposit kamu.`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }
            }
            break;
        case ((/\/acceptdeposit/i.test(conversation)) && conversation.startsWith('/acceptdeposit')): {
            if (m.isAdmin) {
                var response;

                var orders = await OrderModel.find({
                    _id: conversation.split(' ')[1],
                    type: 'deposit',
                    pending: true,
                    confirmed: false,
                })

                if (conversation.split(' ').length < 2) {
                    response = 'Format tidak sesuai!\n\nContoh: */acceptdeposit ORDER_ID*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (orders.length <= 0) {
                    response = `ORDER_ID tidak ditemukan!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var { _id: order_id, nominal, confirmed, user_id } = orders[0]

                    if (!confirmed) {
                        var _user  = await UserModel.find({
                            _id: user_id
                        })

                        _user = _user[0]

                        response = `Order Deposit dengan Order ID *${order_id}* berhasil di-order dan saldo akan di-transfer ke *${_user.number}* senilai *${nominal}*`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                        
                        await OrderModel.update(order_id, {
                            confirmed: true,
                            pending: false
                        })

                        var total_saldo = (+nominal + +_user.saldo)

                        await UserModel.update(_user?.number, {
                            saldo: total_saldo
                        })

                        response = `----------\nORDER ID: *#${order_id}*\nSTATUS: *SUCCESS*\n----------\n\nSelamat, ${_user.pushName}!, Deposit telah dikonfirmasi oleh Admin dengan nominal saldo sebesar *${nominal}*. Kamu dapat melihat saldo dengan mengetik command */profile*.\n\nNb: Saldo dapat kamu gunakan untuk pembelian produk yang telah disediakan di Menu Produk. Kamu dapat melihat produk dengan mengetik */listproduk*`
                        await sock.sendMessage(`${_user.number}@s.whatsapp.net`, { text: response })
                    } else {
                        response = `ORDER_ID *#${order_id}* tidak dapat di-konfirmasi!`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                    }
                }
                return
            } else {
                let response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break
        case ((/\/declinedeposit/i.test(conversation)) && conversation.startsWith('/declinedeposit')): {
            if (m.isAdmin) {
                var response;

                orders = await OrderModel.find({
                    _id: conversation.split(' ')[1],
                    type: 'deposit',
                    pending: true,
                    confirmed: false,
                })

                if (conversation.split(' ').length < 2) {
                    response = 'Format tidak sesuai!\n\nContoh: */declinedeposit ORDER_ID*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (orders.length <= 0) {
                    response = `ORDER_ID tidak ditemukan!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var { _id: order_id, nominal, confirmed, user_id } = orders[0]

                    if (!confirmed) {
                        var _user  = await UserModel.find({
                            _id: user_id
                        })

                        _user = _user[0]

                        response = `Order Deposit dengan Order ID *${order_id}* berhasil di-gagalkan. Notifikasi pembayaran gagal akan diteruskan ke *${_user.number}*`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                        
                        await OrderModel.destroy(order_id)

                        response = `----------\nORDER ID: *#${order_id}*\nSTATUS: *GAGAL*\n----------\n\nSayangnya kami tidak dapat meng-konfirmasi pembayaran kamu. Coba lagi di lain waktu, ya!`
                        await sock.sendMessage(`${_user.number}@s.whatsapp.net`, { text: response })
                    } else {
                        response = `ORDER_ID *#${order_id}* tidak dapat di-konfirmasi!`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                    }
                }
            } else {
                let response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break;
        default:
            var response;
            var channelPayment = {
                'GOPAY': '3.00%',
                'QRIS': 'Rp100 + 0.70%',
                'QRISREALTIME': '1.70%',
            }

            var orders = await CartModel.find({
                user_id: user._id,
                type: 'deposit',
                confirmed: false
            })

            if (!!deposit_session && !(v2order_session || checkout_session || tokovoucher_session)) {
                if (TOKOPAY) {
                    if (orders.length === 1) {
                        if (((conversation).toUpperCase() in channelPayment)) {
                            if ((cart_deposit).length === 1) {
                                try {
                                    var key_id = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : m.key
                                    sock.session[remoteJid]['key_react']  = key_id
        
                                    await sock.sendMessage(remoteJid, {
                                        react: {
                                            text: '🕒',
                                            key: sock.session[remoteJid]['key_react']
                                        }
                                    })
        
                                    var trx_id = sock.session[remoteJid]['trx_ids']['deposit']
        
                                    var { response: tokopay_response } = await createAdvancedOrder(
                                        TOKOPAY_MERCHANT_ID,
                                        TOKOPAY_SECRET_KEY,
                                        trx_id,
                                        sock.session[remoteJid]['total'],
                                        (conversation).toUpperCase(),
                                        {
                                            products: sock.session[remoteJid]['carts'],
                                            user: {
                                                pushName: pushName,
                                                number: phone
                                            }
                                        },
                                    )
            
                                    Log.info(`TOKOPAY RESPONSE: ${JSON.stringify(tokopay_response)}`)
                                    
                                    var {
                                        trx_id: _trx_id,
                                        total_bayar
                                    } = tokopay_response
        
                                    switch ((conversation).toUpperCase()) {
                                        case 'QRIS':
                                        case 'QRISREALTIME':
                                            var {
                                                qr_link,
                                            } = tokopay_response
            
                                            response = `Silahkan scan QRIS diatas untuk melakukan pembayaran sesuai total bayar yang tertera dibawah ini.\n\nTotal: ${sock.session[remoteJid]['total']}\nBiaya Admin: ${channelPayment[(conversation).toUpperCase()]}\nTotal Bayar: ${total_bayar}\n\nSegera untuk melakukan pembayaran sebelum QRIS expired. Kami akan mengirimkan notifikasi beserta credentials akun jika Anda berhasil melakukan pembayaran sesuai nominal tertera.\n\n_trx_id: ${trx_id}_`
            
                                            await sock.sendMessage(remoteJid, {
                                                image: {
                                                    url: qr_link
                                                },
                                                caption: response,
                                            })
                                            break;
                                        default:
                                            var {
                                                checkout_url,
                                            } = tokopay_response
            
                                            response = `Silahkan klik link dibawah ini untuk melakukan pembayaran sesuai total bayar dibawah ini.\n\nLink: ${checkout_url}\nTotal: ${sock.session[remoteJid]['total']}\nBiaya Admin: ${channelPayment[(conversation).toUpperCase()]}\nTotal Bayar: ${total_bayar}\n\nSegera untuk melakukan pembayaran sebelum link expired. Kami akan mengirimkan notifikasi beserta credentials akun jika Anda berhasil melakukan pembayaran sesuai nominal tertera.\n\n_trx_id: ${trx_id}_`
            
                                            await sock.sendMessage(remoteJid, { text: response })
                                            break
                                    }
        
                                    var job = queue.create(`create invoice document ${trx_id}`, { 
                                        title: `create invoice document #${trx_id}`
                                    }).delay(6_000).save( function(err){
                                        if(!err) Log.info(`[JOB QUEUE CREATED]: ${job.id}`)
                                    })
        
                                    var fileName = path.resolve(`public/${trx_id}.pdf`)
        
                                    queue.process(`create invoice document ${trx_id}`, async (_, done) => {
                                        Log.info(`[JOB QUEUE IS PROCESS]: Create Invoice Document #${trx_id}`)
                                        
                                        var cart = sock.session[remoteJid]['carts'][0]
        
                                        var items = [
                                            {
                                                item: cart?.product_code, 
                                                description: cart?.name,
                                                id_tujuan: phone, 
                                                amount: sock.session[remoteJid]['total'], 
                                                quantity: 1,
                                            }
                                        ]
        
                                        const invoice = {
                                            shipping: {
                                                name: pushName,
                                                number: phone,
                                                status: 'Pending'
                                            },
                                            items: [...items],
                                            subtotal: sock.session[remoteJid]['total'],
                                            total: total_bayar,
                                            tax: channelPayment[(conversation).toUpperCase()],
                                            invoice_nr: trx_id
                                        };
                                        
                                        createInvoice(invoice, fileName);
                    
                                        done()
                                    })
        
                                    job.on('complete', async function(result){
                                        Log.info('[JOB QUEUE IS COMPLETED]');
        
                                        setTimeout( async () => {
                                            await sock.sendMessage(remoteJid, {
                                                react: {
                                                    text: '',
                                                    key: sock.session[remoteJid]['key_react']
                                                }
                                            })
        
                                            sock.session[remoteJid]['key_react'] = null
                                        })
                                        
                                        await sock.sendMessage(remoteJid, {
                                            document: {
                                                url: fileName
                                            },
                                            fileName: `INVOICE - ${trx_id}.pdf`,
                                            mimetype: 'application/pdf',
                                        })
        
                                        setTimeout(() => {
                                            sock.session[remoteJid]['total']  = 0
                                            sock.session[remoteJid]['carts']  = []
                                            sock.session[remoteJid]['sessions']['deposit'] = false
                                            sock.session[remoteJid]['trx_ids']['deposit']  = null
                                        }, 1000)
                                        // fs.unlinkSync(fileName)
                                    }).on('failed attempt', function(errorMessage, doneAttempts){
                                        Log.error(`[JOB QUEUE IS FAILED ATTEMPT]: ${errorMessage}`);
                                    }).on('failed', function(errorMessage){
                                        Log.error(`[JOB QUEUE IS FAILED]: ${errorMessage}`);
                                    }).on('progress', function(progress, data){
                                        Log.info('\r  job #' + job.id + ' ' + progress + '% complete with data ', data );
                                    })
                                } catch (error) {
                                    Log.error(`[${new Date()}] [TOKOPAY ADVANCED] : ${error}`)
                                    setTimeout( async () => {
                                        await sock.sendMessage(remoteJid, {
                                            react: {
                                                text: '',
                                                key: sock.session[remoteJid]['key_react']
                                            }
                                        })
        
                                        sock.session[remoteJid]['key_react'] = null
                                    })
        
                                    response = '*Deposit Gagal*:\nUnable to fetch API.'
                                    await Sock.sendTextMessage(remoteJid, { text:  response })
                                } 
                            }
                        }
                    } 
                }
            }
            break;
    }
}

module.exports = { handler }
