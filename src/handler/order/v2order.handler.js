process.on('uncaughtException', async (err, origin) => {
    console.log('error [checkout v2order handler]', err)
});

require('dotenv').config()

const path = require('node:path')
const fs = require('node:fs')
const { writeFile } = require('fs/promises')

const { downloadMediaMessage } = require('@whiskeysockets/baileys')
const { User, Product, Order, Cart } = require(path.resolve('src/models/index'))
const { Helper } = require(path.resolve('src/helpers/index.js'))
const { createAdvancedOrder } = require(path.resolve('src/config/tokopay.js'))
const { createInvoice } = require(path.resolve('src/config/pdfkit.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { emitter } = require(path.resolve('src/config/emitter.js'))
const { queue, Sock } = require(path.resolve('src/config/queue.js'))

const UserModel    = new User()
const ProductModel = new Product()
const OrderModel   = new Order()
const CartModel    = new Cart()

const handler = async (sock, m, conversation, remoteJid, logger, messageType) => {
    Sock.sock = sock
    var phone    = remoteJid.split('@')[0]
    var pushName = m?.pushName || '-'

    var { 
        ADMIN, 
        TOKOVOUCHER, 
        TOKOPAY,
        TOKOPAY_MERCHANT_ID,
        TOKOPAY_SECRET_KEY,
        SATTLE_PRICE
    } = process.env

    ADMIN = eval(ADMIN)

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
    var products  = await ProductModel.findAll()

    var checkout_session    = sock.session[remoteJid]['sessions']['checkout']    ? sock.session[remoteJid]['sessions']['checkout']    : false
    var v2order_session     = sock.session[remoteJid]['sessions']['v2order']     ? sock.session[remoteJid]['sessions']['v2order']     : false
    var tokovoucher_session = sock.session[remoteJid]['sessions']['tokovoucher'] ? sock.session[remoteJid]['sessions']['tokovoucher'] : false
    var deposit_session     = sock.session[remoteJid]['sessions']['deposit']     ? sock.session[remoteJid]['sessions']['deposit']     : false
    var cart_v2order        = sock.session[remoteJid]['cart']['v2order']         ? sock.session[remoteJid]['cart']['v2order']         : []

    emitter.on(`v2order-${remoteJid}`, ({ remoteJid: _remoteJid }) => {
        sock.session[_remoteJid]['carts'] = []
        sock.session[_remoteJid]['cart']['v2order'] = []
        sock.session[_remoteJid]['sessions']['v2order'] = false
        sock.session[_remoteJid]['trx_ids']['v2order']  = null
        setTimeout(() => {
            emitter.off(`v2order-${_remoteJid}`)
        })
    })

    switch (true) {
        case ((/\/v2order/i.test(conversation)) && conversation.startsWith('/v2order')): {
            var response;
            if (conversation.split(' ')[1] === 'cancel') {
                var orders = await CartModel.find({
                    user_id: user._id,
                    type: 'product',
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
                    response = 'Sesi *v2order* berhasil dibatalkan.'
                    await Sock.sendTextMessage(remoteJid, { text: response })

                    sock.session[remoteJid]['carts'] = []
                    sock.session[remoteJid]['cart']['v2order'] = []
                    sock.session[remoteJid]['sessions']['v2order'] = false
                    sock.session[remoteJid]['trx_ids']['v2order']  = null
                })
            } else {
                if (v2order_session || (cart_v2order).length >= 1) {
                    response = 'Sesi *v2order* kamu masih aktif atau terdapat sesi lainnya yang masih aktif. Pastikan kamu sudah memilih metode pembayaran yang tersedia dan segera melakukan pembayaran.\n\nNotes:\n* Harap untuk menunggu 5 menit untuk menggunakan command ini selanjutnya.\n* Ketik */v2order cancel* untuk membatalkan sesi v2order sebelumnya.'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    if (conversation.split(' ').length > 2) {
                        global._total = 0;
                        if (conversation.split(' ')[1] != 'cancel' && ![...products.map(({ sku: _sku }) => _sku)].includes(conversation.split(' ')[1])) {
                            response = `SKU Produk tidak ditemukan!`
                            await Sock.sendTextMessage(remoteJid, { text: response })
                        } else if (conversation.split(' ')[1] != 'cancel' && isNaN(+(conversation.split(' ')[2]))) {
                            response = `Format \`qty\` harus berupa angka!`
                            await Sock.sendTextMessage(remoteJid, { text: response })
                        } else {
                            var sku = conversation.split(' ')[1]
                            var qty = +(conversation.split(' ')[2])
            
                            var { 
                                nama,
                                harga,
                                credentials,
                            } = await ProductModel.findOne(sku)
            
                            if (credentials.length <= 0) {
                                response = `Stok untuk produk dengan SKU *${sku}* sedang kosong!`
                                await Sock.sendTextMessage(remoteJid, { text: response })
                            } else if (credentials.length < qty) {
                                response = `Produk dengan SKU *${sku}* hanya memiliki ${credentials.length} stok!`
                                await Sock.sendTextMessage(remoteJid, { text: response })
                            } else {
                                sock.session[remoteJid]['sessions']['v2order'] = true
        
                                var trx_id = sock.session[remoteJid]['trx_ids']['v2order'] ? sock.session[remoteJid]['trx_ids']['v2order'] : Helper.generateTrxId()
            
                                sock.session[remoteJid]['trx_ids']['v2order']  = trx_id
    
                                var meta = await ProductModel.findOne(sku) 
                                
                                var orders = await CartModel.find({
                                    user_id: user._id,
                                    type: 'product',
                                    confirmed: false,
                                    order_id: null,
                                    type_checkout: 'single'
                                })
                
                                if (orders.length > 0) {
                                    orders.map( async ({ _id: cart_id }) => {
                                        await CartModel.destroy(cart_id)
                                    })
                                }
    
                                var cart = await CartModel.create({
                                    sattle_price: +SATTLE_PRICE,
                                    credentials: null,
                                    confirmed: false,
                                    qty: qty,
                                    user_id: user._id,
                                    product_id: meta._id,
                                    order_id: null,
                                    type: 'product',
                                    meta: JSON.stringify(meta),
                                    trx_id: sock.session[remoteJid]['trx_ids']['v2order'],
                                    type_checkout: 'single',
                                    temporary: true
                                })
    
                                var _meta = JSON.parse(cart.meta)
                                var { nama, harga, sku } = _meta

                                global._total += ((harga+ +SATTLE_PRICE)*cart.qty)
                                sock.session[remoteJid]['total'] = global._total 
    
                                sock.session[remoteJid]['carts'] = [
                                    {
                                        product_code: sku,
                                        name: `${nama} | qty: ${qty}`,
                                        price: global._total , 
                                        product_url: 'https://product.com', 
                                        image_url: 'https://image.com' 
                                    }
                                ]
    
                                sock.session[remoteJid]['cart']['v2order'] = sock.session[remoteJid]['carts']
    
                                if (TOKOPAY) {
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
                                } else {
                                    response = `Halo ${pushName},\n\nBerikut data produk yang telah kamu order:\n\nNama: ${nama}\nSKU: ${sku}\nHarga: ${(harga+ +SATTLE_PRICE)}\nQty: ${qty}\nTotal: ${sock.session[remoteJid]['total']}\nHarap untuk membayar dengan Qris diatas!\n\nOh iya, jangan lupa ketik */konfirmasiorder* jika kamu sudah membayar, ya! Agar admin/ owner segera mengirimkan credentials produk yang berhasil di order!\n\nNote: kamu diberikan waktu 5 menit untuk melakukan konfirmasi.`
                                    await sock.sendMessage(remoteJid, {
                                        image: fs.readFileSync('./public/qris.jpg'),
                                        caption: response
                                    }, {
                                        contextInfo: {
                                            isForwarded: true,
                                            forwardingScore: 1
                                        }
                                    })
                                }
    
                                setTimeout(() => {
                                    sock.session[remoteJid]['carts'] = []
                                    sock.session[remoteJid]['cart']['v2order']  = []
                                    sock.session[remoteJid]['sessions']['v2order'] = false
                                    sock.session[remoteJid]['trx_ids']['v2order']  = null
                                }, 300_000); // 5 menit
                            }
                        }
                    } else {
                        response = `Format tidak sesuai!\n\nFormat: */v2order SKU qty*\n\nContoh: */v2order SKU 2*`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                    }
                }
            }
            break;
        }
        case (/\/konfirmasiorder$/i.test(conversation)): {
            var response;
            if (TOKOPAY) {
                response = `Fitur sementara di non-aktifkan.\n\nTips: Nonaktifkan fitur tokopay pada file .env pada varaiable\n\nTOKOPAY=true\n\nUbah menjadi:\n\nTOKOPAY=false\n\ndan jalankan kembali bot ini.`
                await Sock.sendTextMessage(remoteJid, { text: response })
            } else {
                if (v2order_session || (cart_v2order).length >= 1) {
                    if (messageType === 'imageMessage') {
                        var order = await CartModel.find({
                            user_id: user._id,
                            type: 'product',
                            confirmed: false,
                            order_id: null,
                            type_checkout: 'single'
                        })
                        order = order[0]

                        var { product_id, user_id } = order

                        var trx_id = sock.session[remoteJid]['trx_ids']['v2order']

                        var _user = await UserModel.find({
                            _id: user_id
                        })
                        _user = _user[0]
                        
                        const buffer = await downloadMediaMessage(m,'buffer', { },
                            { 
                                logger,
                                reuploadRequest: sock.updateMediaMessage
                            }
                        )
        
                        // save to file
                        await writeFile(`./public/orders/bukti-tf-${trx_id}.jpg`, buffer)
    
                        var product = await ProductModel.find({
                            _id: product_id
                        })
                        product = product[0]
        
                        response = `Halo Admin,\n\n${phone} telah melakukan konfirmasi terkait pembayaran untuk produk:\n\nNama: ${product?.nama}\nSKU: ${product?.sku}\nHarga: ${product?.harga}\nQty: ${order?.qty}\n\nHarap untuk periksa kembali konfirmasi pembayaran tersebut.\n\nApa yang dapat dilakukan?\n\nKetik */acceptorder ${user_id}* untuk meng-konfirmasi pembayaran berhasil, dan\nKetik */declineorder ${user_id}* untuk meng-konfirmasi pembayaran ditolak.`
                        ADMIN.map( async (_remote_jid) => {
                            await sock.sendMessage(`${_remote_jid}@s.whatsapp.net`, {
                                text: response
                            }, {
                                quoted: m
                            })
                        })
                        
                        response = `Pembayaran produk dengan nomor order *#${trx_id}* berhasil diteruskan ke admin/ owner. Harap untuk menunggu konfirmasi dari admin untuk melakukan pengecekan pembayaran kamu, ya!\n\nNote: Credentials produk akan segera dikirimkan apabila admin/ owner berhasil men-setujui pembayaran kamu.`
                        await sock.sendMessage(remoteJid, { text: response })
                    }
                }
            }
            break;
        }
        case ((/\/acceptorder/i.test(conversation)) && conversation.startsWith('/acceptorder')): {
            var response;
            if (m.isAdmin) {
                if (TOKOPAY) {
                    response = `Fitur sementara di non-aktifkan.\n\nTips: Nonaktifkan fitur tokopay pada file .env pada varaiable\n\nTOKOPAY=true\n\nUbah menjadi:\n\nTOKOPAY=false\n\ndan jalankan kembali bot ini.`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var order_id  = conversation.split(' ')[1]

                    var _user = await UserModel.find({
                        _id: order_id
                    })
                    _user = _user[0]


                    var order = await CartModel.find({
                        user_id: _user._id,
                        type: 'product',
                        confirmed: false,
                        order_id: null,
                        type_checkout: 'single'
                    })

                    if (conversation.split(' ').length < 2) {
                        response = 'Format tidak sesuai!\n\nContoh: */acceptorder ORDER_ID*'
                        await sock.sendMessage(remoteJid, { text: response })
                    } else if (order.length <= 0) {
                        response = `ORDER_ID tidak ditemukan!`
                        await sock.sendMessage(remoteJid, { text: response })
                    } else {
                        var { product_id, user_id } = order[0]

                        var _remote_jid = `${_user?.number}@s.whatsapp.net`
        
                        var { product_id, user_id, confirmed, meta, qty } = order[0]
                        var trx_id = sock.session[_remote_jid]['trx_ids']['v2order']

                        if (!confirmed) {
                            var product = await ProductModel.find({
                                _id: product_id
                            })
                            product = product[0]
                            
                            // create order
                            var orderNew = await OrderModel.create({
                                user_id: _user._id,
                                trx_id: trx_id,
                                createdAt: new Date().getTime()
                            })

                            order = order[0]

                            await CartModel.update(order._id, {
                                confirmed: true,
                                temporary: false,
                                order_id: orderNew._id,
                                credentials: product.credentials.slice(0, qty)
                            })

                            await ProductModel.update(product.sku, {
                                credentials: product?.credentials.slice(qty),
                            })

                            response = `Order Produk dengan SKU *${product?.sku}* berhasil di-order dan credentials produk akan diteruskan ke *${_user.number}*`
                            await sock.sendMessage(remoteJid, { text: response })

                            setTimeout(() => {
                                sock.session[_remote_jid]['carts'] = []
                                sock.session[_remote_jid]['cart']['v2order']  = []
                                sock.session[_remote_jid]['sessions']['v2order'] = false
                                sock.session[_remote_jid]['trx_ids']['v2order']  = null
                            })

                            response = `----------\nORDER ID: *#${trx_id}*\nSTATUS: *SUCCESS*\n----------\n\nBerikut adalah credentials dari product sebelumnya yang berhasil kamu order:\n${product.credentials.slice(0, qty).join('\n')}`
                            await sock.sendMessage(_remote_jid, { text: response })
                        } else {
                            response = `ORDER_ID *#${order_id}* tidak dapat di-konfirmasi!`
                            await sock.sendMessage(remoteJid, { text: response })
                        }
                    }
                }
            } else {
                response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
            }
            break;
        }
        case ((/\/declineorder/i.test(conversation)) && conversation.startsWith('/declineorder')): {
            var response;
            if (m.isAdmin) {
                if (TOKOPAY) {
                    response = `Fitur sementara di non-aktifkan.\n\nTips: Nonaktifkan fitur tokopay pada file .env pada varaiable\n\nTOKOPAY=true\n\nUbah menjadi:\n\nTOKOPAY=false\n\ndan jalankan kembali bot ini.`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var order_id  = conversation.split(' ')[1]
                    var _user = await UserModel.find({
                        _id: order_id
                    })
                    _user = _user[0]

                    var order = await CartModel.find({
                        user_id: _user._id,
                        type: 'product',
                        confirmed: false,
                        order_id: null,
                        type_checkout: 'single'
                    })

                    if (conversation.split(' ').length < 2) {
                        response = 'Format tidak sesuai!\n\nContoh: */declineorder ORDER_ID*'
                        await sock.sendMessage(remoteJid, { text: response })
                    } else if (order.length <= 0) {
                        response = `ORDER_ID tidak ditemukan!`
                        await sock.sendMessage(remoteJid, { text: response })
                    } else {
                        var { product_id, user_id } = order[0]

                        var _remote_jid = `${_user?.number}@s.whatsapp.net`
        
                        var { product_id, user_id, confirmed, meta, qty } = order[0]
                        var trx_id = sock.session[_remote_jid]['trx_ids']['v2order']

                        if (!confirmed) {
                            var product = await ProductModel.find({
                                _id: product_id
                            })
                            product = product[0]

                            var { sku } = product

                            response = `Order Produk dengan SKU *${sku}* berhasil di-gagalkan. Notifikasi pembayaran gagal akan diteruskan ke *${_user.number}*`
                            await sock.sendMessage(remoteJid, { text: response })

                            setTimeout(() => {
                                if (order.length > 0) {
                                    order.map( async ({ _id: cart_id }) => {
                                        await CartModel.destroy(cart_id)
                                    })
                                }
                                sock.session[_remote_jid]['carts'] = []
                                sock.session[_remote_jid]['cart']['v2order']  = []
                                sock.session[_remote_jid]['sessions']['v2order'] = false
                                sock.session[_remote_jid]['trx_ids']['v2order']  = null
                            })

                            response = `----------\nORDER ID: *#${trx_id}*\nSTATUS: *GAGAL*\n----------\n\nSayangnya kami tidak dapat meng-konfirmasi pembayaran kamu. Coba lagi di lain waktu, ya!`
                            await sock.sendMessage(_remote_jid, { text: response })
                        } else {
                            response = `ORDER_ID *#${trx_id}* tidak dapat di-konfirmasi!`
                            await sock.sendMessage(remoteJid, { text: response })
                        }
                    }
                }
            }
            break;
        }
        default:
            var response;
            var channelPayment = {
                'GOPAY': '3.00%',
                'QRIS': 'Rp100 + 0.70%',
                'QRISREALTIME': '1.70%',
            }

            var orders = await CartModel.find({
                user_id: user._id,
                type: 'product',
                confirmed: false,
                order_id: null,
                type_checkout: 'single'
            })

            if (!!v2order_session && !(checkout_session || deposit_session || tokovoucher_session)) {
                if (TOKOPAY) {
                    if (orders.length >= 1) {
                        if (((conversation).toUpperCase() in channelPayment)) {
                            if ((cart_v2order).length >= 1) {
                                try {
                                    var key_id = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : m.key
                                    sock.session[remoteJid]['key_react']  = key_id
        
                                    await sock.sendMessage(remoteJid, {
                                        react: {
                                            text: '🕒',
                                            key: sock.session[remoteJid]['key_react']
                                        }
                                    })
        
                                    var trx_id = sock.session[remoteJid]['trx_ids']['v2order']

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

                                        var carts = await CartModel.find({
                                            user_id: user._id,
                                            type: 'product',
                                            confirmed: false,
                                            order_id: null,
                                            type_checkout: 'single'
                                        })
    
                                        var items = carts.map(({
                                            meta,
                                            qty
                                        }) => {
                                            var { nama, harga, sku } = JSON.parse(meta)
                                            return {
                                                item: sku, 
                                                description: `${nama} | qty: ${qty}`, 
                                                amount: ((harga+ +SATTLE_PRICE)*qty), 
                                                quantity: qty,
                                            }
                                        })

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
                                            sock.session[remoteJid]['sessions']['v2order'] = false
                                            sock.session[remoteJid]['trx_ids']['v2order']  = null
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
        
                                    response = '*Checkout Gagal*:\nUnable to fetch API.'
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