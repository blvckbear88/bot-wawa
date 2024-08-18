process.on('uncaughtException', async (err, origin) => {
    console.log('error [checkout handler]', err)
});

require('dotenv').config()

const path = require('node:path')
const fs = require('node:fs')

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

    var checkout_session    = sock.session[remoteJid]['sessions']['checkout']    ? sock.session[remoteJid]['sessions']['checkout']    : false
    var v2order_session     = sock.session[remoteJid]['sessions']['v2order']     ? sock.session[remoteJid]['sessions']['v2order']     : false
    var tokovoucher_session = sock.session[remoteJid]['sessions']['tokovoucher'] ? sock.session[remoteJid]['sessions']['tokovoucher'] : false
    var deposit_session     = sock.session[remoteJid]['sessions']['deposit']     ? sock.session[remoteJid]['sessions']['deposit']     : false
    var cart_checkout       = sock.session[remoteJid]['cart']['checkout']        ? sock.session[remoteJid]['cart']['checkout']        : []

    emitter.on(`checkout-${remoteJid}`, ({ remoteJid: _remoteJid }) => {
        sock.session[_remoteJid]['carts'] = []
        sock.session[_remoteJid]['cart']['checkout'] = []
        sock.session[_remoteJid]['sessions']['checkout'] = false
        sock.session[_remoteJid]['trx_ids']['checkout']  = null
        setTimeout(() => {
            emitter.off(`checkout-${_remoteJid}`)
        })
    })

    switch (true) {
        case ((/\/checkout/i.test(conversation)) && conversation.startsWith('/checkout')): {
            if (conversation.split(' ')[1] === 'cancel') {
                var orders = await CartModel.find({
                    user_id: user._id,
                    type: 'product',
                    confirmed: false,
                    order_id: null,
                })

                if (orders.length > 0) {
                    orders.map( async ({ _id: cart_id }) => {
                        await CartModel.update(cart_id, {
                            trx_id: null
                        })
                    })
                }

                setTimeout(async () => {
                    response = 'Sesi *checkout* berhasil dibatalkan.'
                    await Sock.sendTextMessage(remoteJid, { text: response })

                    sock.session[remoteJid]['carts'] = []
                    sock.session[remoteJid]['cart']['checkout'] = []
                    sock.session[remoteJid]['sessions']['checkout'] = false
                    sock.session[remoteJid]['trx_ids']['checkout']  = null
                })
            } else {
                // revisi
                if (checkout_session || (cart_checkout).length >= 1) {
                    response = 'Sesi *checkout* kamu masih aktif atau terdapat sesi lainnya yang masih aktif. Pastikan kamu sudah memilih metode pembayaran yang tersedia dan segera melakukan pembayaran.\n\nNotes:\n* Harap untuk menunggu 5 menit untuk menggunakan command ini selanjutnya.\n* Ketik */checkout cancel* untuk membatalkan sesi checkout sebelumnya.'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var orders = await CartModel.find({
                        user_id: user._id,
                        confirmed: false,
                        order_id: null,
                        type: 'product',
                        temporary: false,
                    })

                    if (orders.length > 0) {
                        global._response = '*🛒 Rincian Checkout*:'
                        global._total = 0
                        sock.session[remoteJid]['sessions']['checkout'] = true
    
                        var _trx_id = sock.session[remoteJid]['trx_ids']['checkout'] ? sock.session[remoteJid]['trx_ids']['checkout'] : Helper.generateTrxId()
        
                        sock.session[remoteJid]['trx_ids']['checkout']  = _trx_id
    
                        sock.session[remoteJid]['carts'] = orders.map(({
                            meta,
                            qty
                        }) => {
                            var { nama, harga, sku } = JSON.parse(meta)
                            return {
                                product_code: sku, 
                                name: `${nama} | qty: ${qty}`, 
                                price: (harga+ +SATTLE_PRICE), 
                                product_url: 'https://product.com', 
                                image_url: 'https://image.com' 
                            }
                        })

                        sock.session[remoteJid]['cart']['checkout'] = sock.session[remoteJid]['carts']

                        for (var i = 0; i < orders.length; i++) {
                            await CartModel.update(orders[i]['_id'], {
                                type_checkout: 'multiple',
                                trx_id: sock.session[remoteJid]['trx_ids']['checkout']
                            })
        
                            var _products = JSON.parse(orders[i]['meta'])
            
                            var {
                                nama,
                                harga,
                            } = _products
        
                            var { credentials, confirmed, type, qty } = orders[i]
                            
                            if (!confirmed) {
                                global._total += ((harga+ +SATTLE_PRICE)*qty)
                                global._response += `\n\n${i+1}) *${type == 'product' ? nama.trim() : nama}*\n${type == 'product' ? `\nSKU : ${_products?.sku || '-'}\nDurasi : ${_products?.durasi || '-'}\nHarga Per Item : ${harga+ +SATTLE_PRICE}\nJumlah Item : ${qty}\nSub Total  : ${((harga+ +SATTLE_PRICE)*qty)}\n--------------- INFO AKUN ---------------\n${credentials || '-'}` : ``}`
                            }
                        }

                        sock.session[remoteJid]['total'] = global._total
                        
                        global._response += `\n\nTotal Harga: ${global._total}`
                        await sock.sendMessage(remoteJid, { text:  global._response })
                        
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
        
                            await sock.sendMessage(remoteJid, { text:  response })
                        } else {
                            global._credentials = '';
                            global._response = 'Order berhasil dilakukan.'
                            response = ''

                            // without payment gateaway, using saldo
                            if (+user.saldo < +global._total) {
                                response = `Saldo kamu tidak cukup! silahkan untuk isi saldo dengan konfirmasi ke owner`
                                await sock.sendMessage(remoteJid, { text: response })
                            } else {
                                // action to moving cart to order
                                // cut saldo user
                                var sisa_saldo = (+user.saldo - +global._total)
                                await UserModel.update(phone, {
                                    saldo: sisa_saldo
                                })

                                // create order
                                var orderNew = await OrderModel.create({
                                    user_id: user._id,
                                    trx_id: sock.session[remoteJid]['trx_ids']['checkout'],
                                    createdAt: new Date().getTime()
                                })

                                // each carts, and update order_id column
                                for (var i = 0; i < orders.length; i++) {
                                    var { meta, qty } = orders[i]
                                    meta = JSON.parse(meta)

                                    var { nama: _nama, sku: _sku, credentials } = meta

                                    await CartModel.update(orders[i]['_id'], {
                                        sattle_price: +SATTLE_PRICE,
                                        credentials: credentials.slice(0, qty),
                                        order_id: orderNew._id,
                                        confirmed: true,
                                        trx_id: orderNew.trx_id,
                                        type_checkout: 'multiple'
                                    })

                                    var { 
                                        _id: product_id, 
                                        harga,
                                        credentials,
                                    } = await ProductModel.findOne(_sku)

                                    await ProductModel.update(_sku, {
                                        credentials: credentials.slice(qty),
                                    })

                                    global._credentials += `${i+1}). *${_nama}*\nCredentials:\n\n${credentials.slice(0, qty).join('\n')}`
                                }

                                response = global._response + '\n\n' + global._credentials
                                await sock.sendMessage(remoteJid, { text: response })
            
                                // forward to admin if ada order masuk
                                await sock.sendMessage(`${ADMIN}@s.whatsapp.net`, {
                                    text: `Halo admin,\n\nAda order masuk nih dari *${remoteJid.split('@')[0]}* untuk produk:\n\n${global._credentials}`
                                })
                            }
                        }

                        setTimeout(() => {
                            sock.session[remoteJid]['carts'] = []
                            sock.session[remoteJid]['cart']['checkout']  = []
                            sock.session[remoteJid]['sessions']['checkout'] = false
                            sock.session[remoteJid]['trx_ids']['checkout']  = null
                        }, 300_000); // 5 menit
                    } else {
                        response = '*Checkout Gagal checkout handlerr*:\nKeranjang kamu kosong!'
                        await Sock.sendTextMessage(remoteJid, { text:  response })
                    }
                }
                // revisi
            }
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
            })

            if (!!checkout_session && !(v2order_session || deposit_session || tokovoucher_session)) {
                if (TOKOPAY) {
                    if (orders.length >= 1) {
                        if (((conversation).toUpperCase() in channelPayment)) {
                            if ((cart_checkout).length >= 1) {
                                try {
                                    var key_id = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : m.key
                                    sock.session[remoteJid]['key_react']  = key_id
        
                                    await sock.sendMessage(remoteJid, {
                                        react: {
                                            text: '🕒',
                                            key: sock.session[remoteJid]['key_react']
                                        }
                                    })
        
                                    var trx_id = sock.session[remoteJid]['trx_ids']['checkout']

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
                                            confirmed: false,
                                            order_id: null,
                                            type_checkout: 'multiple',
                                            temporary: false
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
                                            sock.session[remoteJid]['sessions']['checkout'] = false
                                            sock.session[remoteJid]['trx_ids']['checkout']  = null
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