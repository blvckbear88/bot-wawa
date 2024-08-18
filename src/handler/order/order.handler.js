process.on('uncaughtException', async (err, origin) => {
    console.log('error [order handler]', err)
});

require('dotenv').config()

const path = require('node:path')

const { User, Product, Order, Cart } = require(path.resolve('src/models/index'))
const { Helper } = require(path.resolve('src/helpers/index.js'))

const { Sock } = require(path.resolve('src/config/queue.js'))

const UserModel    = new User()
const ProductModel = new Product()
const OrderModel   = new Order()
const CartModel    = new Cart()

const handler = async (sock, m, conversation, remoteJid, logger, messageType) => {
    Sock.sock = sock

    var phone    = remoteJid.split('@')[0]
    var pushName = m?.pushName || '-'

    var {  
        SATTLE_PRICE,
    } = process.env

    var user  = await UserModel.findOne(phone)
    
    if (!user){
        user = await UserModel.create({
            number: phone,
            pushName,
            saldo: 0,
        })
    }

    var orders = await CartModel.find({
        user_id: user._id,
    })

    var products  = await ProductModel.findAll()

    switch (true) {
        case ((/\/listorder/i.test(conversation)) && conversation.startsWith('/listorder')): {
            var response = '*📦 List Order*:\n'

            global.orders;
            global.orders = await OrderModel.find({
                user_id: user._id,
            })

            if (conversation.split(' ').length > 1) {
                if (m.isAdmin) {
                    if (conversation.split(' ')[1] === 'all') {
                        global.orders = await OrderModel.findAll()
                    } else {
                        var _user = await UserModel.findOne(conversation.split(' ')[1])
                        global.orders = await OrderModel.find({
                            user_id: _user._id,
                        })
                    }
                } else {
                    global.orders = await OrderModel.find({
                        user_id: user._id,
                    })
                }
            }         
            
            if (global.orders.length > 0) {
                global._response = `*📦 List Order*: ${(conversation.split(' ').length > 1 && m.isAdmin && conversation.split(' ')[1] != 'all') ? `*${conversation.split(' ')[1]}*` : ''}\n`
                
                for (var i = 0; i < global.orders.length; i++) {
                    var carts  = await OrderModel.carts(global.orders[i]?._id)

                    var { trx_id, createdAt, user_id } = global.orders[i]
                    var _user = await UserModel.find({
                        _id: user_id
                    })
                    _user = _user[0]

                    global._response += `\n# *ORDER ID*: ${trx_id}\n# *TL*: ${Helper.formattedDate(createdAt)}${(conversation.split(' ').length > 1 && m.isAdmin && conversation.split(' ')[1] === 'all') ? `\nUSER: *${_user.number}*` : ''}\n`

                    if (carts.length) {
                        for (var j = 0; j < carts.length; j++) {
                            var { type, confirmed } = carts[j]
    
                            if (type === 'product') {
                                var credentials = carts[j]?.credentials
                                var _products = JSON.parse(carts[j]['meta'])
                                global._response += `\n${j+1}) *${ _products?.nama.trim()}*\nDurasi : ${_products?.durasi || '-'}\nSKU : ${_products?.sku || '-'}\nHarga : ${_products?.harga}\n--------------- INFO AKUN ---------------\n${!!credentials ? credentials.join('\n\n') :  '-'}\n`
                            }

                            if (type === 'tokovoucher') {
                                var credentials = carts[j]?.credentials
                                var _products = JSON.parse(carts[j]['meta'])
                                global._response += `\n${j+1}) *${ _products?.nama.trim()}*\nSKU : ${_products?.sku || '-'}\nHarga : ${_products?.harga}\nID TUJUAN: ${carts[j]['id_tujuan']}\n`
                            }

                            if (type === 'deposit') {
                                global._response += `\n${j+1}) *DEPOSIT SALDO*\nID TUJUAN: ${carts[j]?.id_tujuan}\nNOMINAL: ${carts[j]?.nominal}\nSTATUS: *SUCCESS*\n`
                            }
                        }
                    } else {
                        global._response += '\n-'
                    }

                    global._response += `\n`
                }

                await Sock.sendTextMessage(remoteJid, { text:  global._response })
            } else {
                response += '\nKeranjang order kamu kosong'
                await Sock.sendTextMessage(remoteJid, { text:  response })
            }
            break;
        }
        case ((/\/cart/i.test(conversation)) && conversation.startsWith('/cart')): {
            var response;

            if (conversation.split(' ').length < 2) {
                orders = await CartModel.find({
                    user_id: user._id,
                    confirmed: false,
                    order_id: null,
                    type: 'product',
                    temporary: false
                })

                if (orders.length > 0) {
                    global._response = '*🛒 List Cart*:'
                    global._total = 0

                    for (var i = 0; i < orders.length; i++) {
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

                    global._response += `\nTotal Harga: ${global._total}`
    
                    await Sock.sendTextMessage(remoteJid, { text:  global._response })
                } else {
                    response = '*🛒 List Cart*:\nKeranjang kamu kosong'
                    await Sock.sendTextMessage(remoteJid, { text:  response })
                }
            } else {
                if (conversation.split(' ').length > 2) {
                    var sku = conversation.split(' ')[1]
                    var qty = conversation.split(' ')[2]
    
                    if (isNaN(+qty)) {
                        response = `Format \`qty\` harus berupa angka!`
                        await Sock.sendTextMessage(remoteJid, { text: response })
                    } else {
                        if (![...products.map(({ sku: _sku }) => _sku)].includes(sku)) {
                            response = `SKU Produk tidak ditemukan!`
                            await Sock.sendTextMessage(remoteJid, { text: response })
                        } else {
                            var { 
                                harga,
                                credentials,
                            } = await ProductModel.findOne(sku)
        
                            if (credentials.length <= 0) {
                                response = `Stok untuk produk dengan SKU *${sku}* sedang kosong!`
                                await Sock.sendTextMessage(remoteJid, { text: response })
                            } else if (credentials.length < +qty) {
                                response = `Produk dengan SKU *${sku}* hanya memiliki ${credentials.length} stok!`
                                await Sock.sendTextMessage(remoteJid, { text: response })
                            } else {
                                var meta = await ProductModel.findOne(sku)
        
                                await CartModel.create({
                                    sattle_price: +SATTLE_PRICE,
                                    credentials: null,
                                    confirmed: false,
                                    qty: +qty,
                                    user_id: user?._id,
                                    product_id: meta?._id,
                                    order_id: null,
                                    type: 'product',
                                    meta: JSON.stringify(meta),
                                    trx_id: null,
                                    type_checkout: null,
                                    temporary: false
                                })
        
                                response = `Produk dengan SKU *${sku}* berhasil ditambahkan kedalam keranjang!`
                                await Sock.sendTextMessage(remoteJid, { text: response })
                            }
                        }
                    }
                } else {
                    response = `Format tidak sesuai!\n\nFormat: */cart SKU qty*\n\nContoh: */cart SKU 2*`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }
            }
            break;
        }
        default:
            break;
    }
}

module.exports = { handler }
