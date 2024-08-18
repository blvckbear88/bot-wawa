process.on('uncaughtException', async (err, origin) => {
    console.log('error [tokovoucher handler]', err)
});

require('dotenv').config()

const path = require('node:path')
const fs = require('node:fs')

const { User, Product, Order, Cart } = require(path.resolve('src/models/index.js'))
const { Helper } = require(path.resolve('src/helpers/index.js'))
const { createAdvancedOrder } = require(path.resolve('src/config/tokopay.js'))
const { createInvoice } = require(path.resolve('src/config/pdfkit.js'))
const { emitter } = require(path.resolve('src/config/emitter.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))
const { queue, Sock } = require(path.resolve('src/config/queue.js'))
const { postTransactionTokovoucher, postTransactionStatus } = require(path.resolve('src/config/tokovoucher.js'))
const { generateSignature } = require(path.resolve('src/config/tokopay.js'))

const UserModel    = new User()
const OrderModel   = new Order()
const CartModel    = new Cart()

const {
    getOperatorList,
    getJenisList,
    getProductList
} = require(
    path.resolve('src/config/tokovoucher.js')
)

const handler = async (sock, m, conversation, remoteJid, logger, messageType) => {
    Sock.sock = sock

    var phone    = remoteJid.split('@')[0]
    var pushName = m?.pushName || '-'

    var { 
        ADMIN, 
        TOKOVOUCHER_MEMBER_CODE, 
        TOKOVOUCHER_SIGNATURE, 
        TOKOPAY_MERCHANT_ID,
        TOKOPAY_SECRET_KEY,
        SATTLE_PRICE 
    } = process.env

    const TOKOVOUCHER = Helper.toBoolean(process.env.TOKOVOUCHER)
    const TOKOPAY = Helper.toBoolean(process.env.TOKOPAY)

    var user  = await UserModel.findOne(phone)
    
    if (!user){
        user = await UserModel.create({
            number: phone,
            pushName,
            saldo: 0,
        })
    }

    const menuListCategory = {
        '/topup-game': 1,
        '/voucher-game': 2,
        '/hiburan': 3,
        '/pulsa': 4,
        '/paket-data': 5,
        '/voucher-data': 6,
        '/pln': 8,
        '/e-money': 9,
        '/tv': 11,
        '/masa-aktif': 12,
        '/pascabayar': 13,
        '/e-toll': 14
    }

    var kodeOperator = [],
        kodeJenis = [],
        kodeProduk = []

    var menu = conversation.split(' ')[0]
    var args = conversation.split(' ').splice(1)

    var inMenu = Object.keys(menuListCategory).findIndex(v => v == menu) 

    var checkout_session    = sock.session[remoteJid]['sessions']['checkout']    ? sock.session[remoteJid]['sessions']['checkout']    : false
    var v2order_session     = sock.session[remoteJid]['sessions']['v2order']     ? sock.session[remoteJid]['sessions']['v2order']     : false
    var tokovoucher_session = sock.session[remoteJid]['sessions']['tokovoucher'] ? sock.session[remoteJid]['sessions']['tokovoucher'] : false
    var deposit_session     = sock.session[remoteJid]['sessions']['deposit']     ? sock.session[remoteJid]['sessions']['deposit']     : false
    var cart_tokovoucher    = sock.session[remoteJid]['cart']['tokovoucher']     ? sock.session[remoteJid]['cart']['tokovoucher']     : []

    emitter.on(`tokovoucher-${remoteJid}`, ({ remoteJid: _remoteJid }) => {
        sock.session[_remoteJid]['carts'] = []
        sock.session[_remoteJid]['cart']['tokovoucher'] = []
        sock.session[_remoteJid]['sessions']['tokovoucher'] = false
        sock.session[_remoteJid]['trx_ids']['tokovoucher']  = null
        setTimeout(() => {
            emitter.off(`tokovoucher-${_remoteJid}`)
        })
    })

    switch (true) {
        case ((menu in menuListCategory) && (inMenu >= 0 && Object.keys(menuListCategory)[inMenu].startsWith(menu))): {
            if (!tokovoucher_session) {
                if ((menu in menuListCategory) && (inMenu >= 0 && Object.keys(menuListCategory)[inMenu].startsWith(menu))) {
                    var response = `*TOKO VOUCHER - ${(menu.substr(1).toUpperCase())} LIST*\n\n`
    
                    if (args.length < 1) { // for get a category list
                        try {
                            var { data } = await getOperatorList(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, menuListCategory[menu])
                            data.map(({ id, nama }, index) => {
                                kodeOperator.push(id)
                                response += `*${index+1}*. ${nama}\n*Code*: ${id}\n`
                            })
        
                            var randomizeOperator = kodeOperator[Math.floor(Math.random() * kodeOperator.length)]
                
                            response += `\n*Note*:\nUntuk melihat jenis dari operator gunakan command:\n\n *${menu} <code_operator>*\n\nContoh: ${menu} ${randomizeOperator}`
                            await sock.sendMessage(remoteJid, { text: response })
                        } catch ({ data }) {
                            response += `\n${data}`
                            await sock.sendMessage(remoteJid, { text: response })
                        }
                    } else if (args.length < 2) { // for get a jenis list
                        if (typeof args[0] !== 'undefined') {
                            try {
                                var { data } = await getJenisList(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, args[0])
                                data.map(({ id, nama, operator_nama }, index) => {
                                    kodeJenis.push(id)
                                    response += `*${index+1}*. ${nama} - ${operator_nama}\n*Code*: ${id}\n\n`
                                })
        
                                var randomizeJenis = kodeJenis[Math.floor(Math.random() * kodeJenis.length)]
        
                                response += `*Note*:\nUntuk melihat list produk dari jenis gunakan command:\n\n *${menu} <code_operator> <code_jenis>*\n\nContoh: ${menu} ${args[0]} ${randomizeJenis}`
                                await sock.sendMessage(remoteJid, { text: response })
                            } catch ({ data }) {
                                response += `\n${data}`
                                await sock.sendMessage(remoteJid, { text: response })
                            }
                        }
                    } else if (args.length < 3) { // for get a product list
                        if (typeof args[1] !== 'undefined') {
                            try {
                                var { data } = await getProductList(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, args[1])
                                data.map(({ code, nama_produk, jenis_name, operator_produk, price }, index) => {
                                    kodeProduk.push(code)
                                    response += `*${index+1}*. ${nama_produk} - ${jenis_name} - ${operator_produk}\n*Price*: ${Helper.formattedCurrency(+price+ +SATTLE_PRICE)}\n*Code*: ${code}\n\n`
                                })
                    
                                var randomizeProduk = kodeProduk[Math.floor(Math.random() * kodeProduk.length)]
        
                                response += `\n\n*Note*:\nUntuk membeli item dari produk gunakan command:\n\n *${menu} <code_operator> <code_jenis> <code_produk> <id_tujuan>*\n\nContoh: ${menu} ${args[0]} ${args[1]} ${randomizeProduk} 6282299265151`
                                await sock.sendMessage(remoteJid, { text: response })
                            } catch ({ data }) {
                                response += `\n${data}`
                                await sock.sendMessage(remoteJid, { text: response })
                            }
                        }
                    } else if (args.length <= 4 || args.length === 3) { // for checkout item        
                       
                        // revisi 24/12
                        if (tokovoucher_session || (cart_tokovoucher).length >= 1) {
                            response = 'Sesi kamu masih aktif atau terdapat sesi pembayaran lain yang masih aktif. Pastikan kamu sudah memilih metode pembayarn yang tersedia dan segera melakukan pembayaran.\n\nNote: Harap untuk menunggu 5 menit untuk menggunakan command ini selanjutnya.'
                            await sock.sendMessage(remoteJid, { text: response })
                        } else {
                            try {
                                var { data } = await getProductList(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, args[1])
    
                                var codes = data.map(({ code }) => code)
                                var code  = args[2];
                                if (codes.indexOf(code) < 0) {
                                    response = `Code tidak ditemukan, silahkan periksa kembali code yang tersedia diatas!`
                                    await sock.sendMessage(remoteJid, { text: response })
                                } else {
                                    if (args.length === 3) {
                                        response = `Format tidak sesuai, harap untuk mencantumkan nomor/id tujuan.\n\nContoh: ${menu} ${args[0]} ${args[1]} ${args[2]} 6282299265151\n\nargs.length: ${args.length}`
                                        await sock.sendMessage(remoteJid, { text: response })
                                    }
    
                                    if (args.length === 4) {
                                        var key_id = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : m.key
                                        sock.session[remoteJid]['key_react']  = key_id

                                        await sock.sendMessage(remoteJid, {
                                            react: {
                                                text: '🕒',
                                                key: sock.session[remoteJid]['key_react']
                                            }
                                        })

                                        var product = data[data.findIndex(({ code: _code }) => _code == code)]
                                        var trx_id = sock.session[remoteJid]['trx_ids']['tokovoucher'] ? sock.session[remoteJid]['trx_ids']['tokovoucher'] : Helper.generateTrxId()
    
                                        sock.session[remoteJid]['trx_ids']['tokovoucher']  = trx_id
                                        sock.session[remoteJid]['sessions']['tokovoucher'] = true
                
                                        var id_product = (Helper.generateTrxId()).split('TRX')[1]
    
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

                                        var meta = {
                                            nama: product?.nama_produk,
                                            durasi: null,
                                            sku: product?.code,
                                            harga: (+product?.price+ +SATTLE_PRICE),
                                            credentials: [],
                                            _id: id_product
                                        }
    
                                        sock.session[remoteJid]['total'] = meta?.harga 
    
                                        await CartModel.create({
                                            id_tujuan: args[3],
                                            sattle_price: +SATTLE_PRICE,
                                            credentials: null,
                                            confirmed: false,
                                            qty: 1,
                                            user_id: user?._id,
                                            product_id: meta?._id,
                                            order_id: null,
                                            type: 'tokovoucher',
                                            meta: JSON.stringify(meta),
                                            trx_id: sock.session[remoteJid]['trx_ids']['tokovoucher'],
                                            type_checkout: 'single',
                                            temporary: true,
                                        })

                                        response = `Halo ${pushName},\n\nBerikut data produk yang telah kamu order:\n\nNama: ${meta?.nama}\nSKU: ${meta?.sku}\nHarga: ${(meta?.harga)}\nQty: ${1}\nTotal: ${sock.session[remoteJid]['total']}\n\nNote: kamu diberikan waktu 15 menit untuk melakukan pembayaran.`
                                        await sock.sendMessage(remoteJid, { text:  response })
                                                
                                        sock.session[remoteJid]['carts'] = [
                                            {
                                                product_code: meta?.sku,
                                                name: `${meta?.nama} | qty: ${1}`,
                                                price: sock.session[remoteJid]['total'], 
                                                product_url: 'https://product.com', 
                                                image_url: 'https://image.com' 
                                            }
                                        ]

                                        sock.session[remoteJid]['cart']['tokovoucher'] = sock.session[remoteJid]['carts']
                                        
                                        setTimeout( async () => {
                                            await sock.sendMessage(remoteJid, {
                                                react: {
                                                    text: '',
                                                    key: sock.session[remoteJid]['key_react']
                                                }
                                            })

                                            sock.session[remoteJid]['key_react'] = null
                                        })

                                        setTimeout(() => {
                                            sock.session[remoteJid]['carts'] = []
                                            sock.session[remoteJid]['cart']['tokovoucher']  = []
                                            sock.session[remoteJid]['sessions']['tokovoucher'] = false
                                            sock.session[remoteJid]['trx_ids']['tokovoucher']  = null
                                        }, 300_000); // 5 menit

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
                                            // cut saldo
                                            var total = sock.session[remoteJid]['total'] 
                                            if (+user.saldo < +total) {
                                                response = 'Saldo kamu tidak cukup! silahkan untuk isi saldo dengan cara */deposit*'
                                                await sock.sendMessage(remoteJid, { text: response })
                                            } else {
                                                 // cut saldo user
                                                var sisa_saldo = (+user.saldo - +total)
                                                await UserModel.update(phone, {
                                                    saldo: sisa_saldo
                                                })

                                                var reff_id = sock.session[remoteJid]['trx_ids']['checkout']
                                                var signature = generateSignature(TOKOPAY_MERCHANT_ID, TOKOPAY_SECRET_KEY, reff_id)

                                                var carts = await CartModel.find({
                                                    trx_id: reff_id,
                                                })

                                                var orderNew = await OrderModel.create({
                                                    user_id: user._id,
                                                    trx_id: reff_id,
                                                    signature,
                                                    createdAt: new Date().getTime()
                                                })

                                                await CartModel.update(_id, {
                                                    order_id: orderNew._id,
                                                    confirmed: true,
                                                    trx_id: reff_id,
                                                    temporary: false
                                                })

                                                var { _id, id_tujuan, user_id, meta } = carts[0]
                                                meta = JSON.parse(meta)

                                                response = `ORDER SEDANG DIPROSES DENGAN RINCIAN PRODUK:\n\nREF ID: ${reff_id}\nID TUJUAN: ${id_tujuan}\n\nKODE PRODUK: *${meta.sku}*\nNAMA PRODUK: ${meta.nama}\nHARGA: ${Helper.formattedCurrency(+meta.harga)}`
                                                await sock.sendMessage(remoteJid, { text: response })
                                               
                                                // post trx
                                                try {
                                                    var { status: status_trx, data: _status, sn } = await postTransactionTokovoucher(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, reff_id, sku, id_tujuan)
                                
                                                    if (status_trx && (_status == 'pending' || _status == 'success') && _status != 0) {
                                                        response = `ORDER BERHASIL DIPROSES DENGAN RINCIAN PRODUK:\n\nREF ID: ${reff_id}\nID TUJUAN: ${id_tujuan}\nSTATUS: *${(_status).toUpperCase()}*\nSN: ${sn}\n\nKODE PRODUK: *${sku}*\nNAMA PRODUK: ${meta?.nama}\nHARGA: ${Helper.formattedCurrency(+meta?.harga)}`
                                                        await sock.sendMessage(remoteJid, { text: response })
                                                    }
                                
                                                    // bila gagagl
                                                    if (_status === 0) {
                                                        response = 'ORDER GAGAL DIKARENAKAN TERJADI KENDALA. JANGAN KHAWATIR, PEMBAYARAN TELAH KAMI KEMBALIKAN KEDALAM SALDO SESUAI NOMONIAL YANG TELAH DIBAYAR.'
                                                        await sock.sendMessage(remoteJid, { text: response })
                                
                                                        // refund to saldo
                                                        var total_saldo = (+meta.harga + +user.saldo)
                                
                                                        await UserModel.update(phone, {
                                                            saldo: total_saldo
                                                        })
                                                    }
                                                } catch ({ data }) {
                                                    Log.error(JSON.stringify(data))
                                                    response = `\n${data}`
                                                    await sock.sendMessage(remoteJid, { text: response })
                                                } finally {
                                                    setTimeout(() => {
                                                        sock.session[remoteJid]['carts'] = []
                                                        sock.session[remoteJid]['cart']['tokovoucher']  = []
                                                        sock.session[remoteJid]['sessions']['tokovoucher'] = false
                                                        sock.session[remoteJid]['trx_ids']['tokovoucher']  = null
                                                    }, 1000);
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch ({ data }) {
                                response += `\n${data}`
                                await sock.sendMessage(remoteJid, { text: response })
                            }
                        }
                        // revisi 24/12

                    }
                }
            }

            if (tokovoucher_session || (cart_tokovoucher).length >= 1) {
                response = 'Sesi *tokovoucher* kamu masih aktif atau terdapat sesi lainnya yang masih aktif. Pastikan kamu sudah memilih metode pembayaran yang tersedia dan segera melakukan pembayaran.\n\nNotes:\n* Harap untuk menunggu 5 menit untuk menggunakan command ini selanjutnya.\n* Ketik */tokovoucher cancel* untuk membatalkan sesi tokovoucher sebelumnya.'
                await Sock.sendTextMessage(remoteJid, { text: response })
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
                type: 'tokovoucher',
                confirmed: false,
                order_id: null,
                type_checkout: 'single'
            })

            if (!!tokovoucher_session  && !(checkout_session || deposit_session || v2order_session)) {
                if (TOKOPAY) {
                    if (orders.length >= 1) {
                        if (((conversation).toUpperCase() in channelPayment)) {
                            if ((cart_tokovoucher).length >= 1) {
                                try {
                                    var key_id = sock.session[remoteJid]['key_react'] ? sock.session[remoteJid]['key_react'] : m.key
                                    sock.session[remoteJid]['key_react']  = key_id
        
                                    await sock.sendMessage(remoteJid, {
                                        react: {
                                            text: '🕒',
                                            key: sock.session[remoteJid]['key_react']
                                        }
                                    })
        
                                    var trx_id = sock.session[remoteJid]['trx_ids']['tokovoucher']
    
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
                                            type: 'tokovoucher',
                                            confirmed: false,
                                            order_id: null,
                                            type_checkout: 'single'
                                        })
    
                                        carts = carts[0]

                                        var { meta, qty, id_tujuan } = carts
                                        meta = JSON.parse(meta)
        
                                        var { nama, harga, sku } = meta
                                        var items = [
                                            {
                                                item: sku, 
                                                description: nama, 
                                                id_tujuan,
                                                amount: ((+harga)), 
                                                quantity: qty,
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
                                            sock.session[remoteJid]['sessions']['tokovoucher'] = false
                                            sock.session[remoteJid]['trx_ids']['tokovoucher']  = null
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
