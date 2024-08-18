/* eslint-disable no-use-before-define */
/* eslint-disable no-redeclare */
/* eslint-disable semi */
/* eslint-disable eqeqeq */
/* eslint-disable camelcase */
/* eslint-disable no-var */
/* eslint-disable no-multi-spaces */
require('dotenv').config()

const path = require('node:path')
const {
    TOKOVOUCHER_MEMBER_CODE,
    TOKOVOUCHER_SIGNATURE,
    TOKOPAY_MERCHANT_ID,
    TOKOPAY_SECRET_KEY
} = process.env

const { User, Product, Order, Cart } = require(path.resolve('src/models/index'))
const { generateSignature } = require(path.resolve('src/config/tokopay.js'))
const { emitter } = require(path.resolve('src/config/emitter.js'))
const { Helper } = require(path.resolve('src/helpers/index.js'))
const { postTransactionTokovoucher, postTransactionStatus } = require(path.resolve('src/config/tokovoucher.js'))
const { logger: Log } = require(path.resolve('src/config/logger.js'))

const UserModel    = new User()
const ProductModel = new Product()
const OrderModel   = new Order()
const CartModel    = new Cart()

const webhookTokopay = async  (req, res, sock) => {
    var { signature, reff_id, status } = req.body

    var user_signature = generateSignature(TOKOPAY_MERCHANT_ID, TOKOPAY_SECRET_KEY, reff_id)

    if ((status == 'Success' || status == 'Completed') && (signature == user_signature)) {
        var response;
        global._credentials = '';
        global._response = '';
        global._total = 0;

        // find cart by reff_id = trx_id
        var carts = await CartModel.find({
            trx_id: reff_id
        })

        if (carts.length > 0) {
            var { user_id, type, type_checkout, confirmed } = carts[0]

            var user = await UserModel.find({
                _id: user_id
            })

            var number = user[0]?.number

            var { number: remoteJid } = user[0]
            remoteJid = `${remoteJid}@s.whatsapp.net`

            if (!confirmed) {
                var orderNew = await OrderModel.create({
                    user_id,
                    trx_id: reff_id,
                    signature,
                    createdAt: new Date().getTime()
                })

                response = `ORDER BERHASIL DILAKUKAN DENGAN NOMOR ORDER: *#${reff_id}*`
                await sock.sendMessage(remoteJid, { text: response })

                if (type === 'product') {
                    global._response += 'BERIKUT CREDENTIALS YANG BERHASIL KAMU ORDER SEBELUMNYA:'

                    for (var i = 0; i < carts.length; i++) {
                        var { meta, qty } = carts[i]
                        meta = JSON.parse(meta)

                        var { nama: _nama, sku: _sku, credentials } = meta

                        await CartModel.update(carts[i]?._id, {
                            credentials: credentials.slice(0, qty),
                            order_id: orderNew._id,
                            confirmed: true,
                            trx_id: reff_id,
                            temporary: false
                        })

                        var {
                            credentials
                        } = await ProductModel.findOne(_sku)

                        await ProductModel.update(_sku, {
                            credentials: credentials.slice(qty)
                        })

                        global._credentials += `\n${i + 1}). *${_nama}*\nCredentials:\n\n${credentials.slice(0, qty).join('\n')}`
                    }

                    response = global._response + '\n\n' + global._credentials
                    await sock.sendMessage(remoteJid, { text: response })

                    setTimeout(async () => {
                        if (type_checkout === 'multiple') {
                            emitter.emit(`checkout-${remoteJid}`, {
                                remoteJid,
                                type: 'checkout'
                            })
                        } else {
                            emitter.emit(`v2order-${remoteJid}`, {
                                remoteJid,
                                type: 'v2order'
                            })
                        }
                    })
                }

                if (type === 'tokovoucher') {
                    var { _id, id_tujuan, user_id, meta } = carts[0]
                    meta = JSON.parse(meta)

                    response = `ORDER SEDANG DIPROSES DENGAN RINCIAN PRODUK:\n\nREF ID: ${reff_id}\nID TUJUAN: ${id_tujuan}\n\nKODE PRODUK: *${meta.sku}*\nNAMA PRODUK: ${meta.nama}\nHARGA: ${Helper.formattedCurrency(+meta.harga)}`
                    await sock.sendMessage(remoteJid, { text: response })

                    await CartModel.update(_id, {
                        order_id: orderNew._id,
                        confirmed: true,
                        trx_id: reff_id,
                        temporary: false
                    })

                    try {
                        var { status: status_trx, data: _status, sn } = await postTransactionTokovoucher(TOKOVOUCHER_MEMBER_CODE, TOKOVOUCHER_SIGNATURE, reff_id, meta.sku, id_tujuan)

                        if (status_trx && (_status == 'pending' || _status == 'success') && _status != 0) {
                            response = `ORDER BERHASIL DIPROSES DENGAN RINCIAN PRODUK:\n\nREF ID: ${reff_id}\nID TUJUAN: ${id_tujuan}\nSTATUS: *${(_status).toUpperCase()}*\nSN: ${sn}\n\nKODE PRODUK: *${meta?.sku}*\nNAMA PRODUK: ${meta?.nama}\nHARGA: ${Helper.formattedCurrency(+meta?.harga)}`
                            await sock.sendMessage(remoteJid, { text: response })
                        }

                        // bila gagagl
                        if (_status === 0) {
                            response = 'ORDER GAGAL DIKARENAKAN TERJADI KENDALA. JANGAN KHAWATIR, PEMBAYARAN TELAH KAMI KEMBALIKAN KEDALAM SALDO SESUAI NOMONIAL YANG TELAH DIBAYAR.'
                            await sock.sendMessage(remoteJid, { text: response })

                            // refund to saldo
                            var total_saldo = (+meta.harga + +user[0]?.saldo)

                            await UserModel.update(number, {
                                saldo: total_saldo
                            })
                        }
                    } catch ({ data }) {
                        Log.error(JSON.stringify(data))
                        response = `\n${data}`
                        await sock.sendMessage(remoteJid, { text: response })
                    } finally {
                        setTimeout(async () => {
                            emitter.emit(`tokovoucher-${remoteJid}`, {
                                remoteJid,
                                type: 'tokovoucher'
                            })
                        })
                    }
                    setTimeout(async () => {
                        emitter.emit(`tokovoucher-${remoteJid}`, {
                            remoteJid,
                            type: 'tokovoucher'
                        })
                    })
                }

                if (type === 'deposit') {
                    var { _id, id_tujuan, user_id, nominal } = carts[0]

                    await CartModel.update(_id, {
                        order_id: orderNew._id,
                        confirmed: true,
                        trx_id: reff_id,
                        temporary: false,
                        pending: false
                    })

                    var total_saldo = (+nominal + +user[0]?.saldo)

                    await UserModel.update(number, {
                        saldo: total_saldo
                    })

                    response = `ORDER BERHASIL DIPROSES DENGAN RINCIAN:\n\nREF ID: ${reff_id}\nID TUJUAN: ${id_tujuan}\nSTATUS: SUCCESS\n\nTIPE: DEPOSIT\nNOMINAL: ${Helper.formattedCurrency(+nominal)}`
                    await sock.sendMessage(remoteJid, { text: response })

                    setTimeout(async () => {
                        emitter.emit(`deposit-${remoteJid}`, {
                            remoteJid,
                            type: 'deposit'
                        })
                    })
                }
            }
        }
    }

    return res.status(200).json({
        status: true
    })
}

const webhookTokovoucher = async (req, res, sock) => {
    var response;
    global._credentials = '';
    global._response = '';
    global._total = 0;

    var signature = req.header('X-TokoVoucher-Authorization')

    Log.info('[*] Incoming webhook tokovoucher:', req.body)

    var order = await OrderModel.find({
        signature
    })
    var { trx_id } = order[0]

    try {
        var transaction = await postTransactionStatus(trx_id)
        Log.info('[*] CHECKING TRANSACTION: ', transaction)

        var { data: { ref_id: reff_id, status, sn } } = transaction

        var carts = await CartModel.find({
            trx_id: reff_id
        })

        if (carts.length > 0) {
            var { user_id } = carts[0]

            var user = await UserModel.find({
                _id: user_id
            })

            var { number: remoteJid } = user[0]
            remoteJid = `${remoteJid}@s.whatsapp.net`

            var { id_tujuan, meta } = carts[0]
            meta = JSON.parse(meta)

            if (status == 'sukses' || status == 'pending') {
                response = `ORDER ${status == 'sukses' ? 'BERHASIL DIPROSES' : 'SEDANG DIPROSES'} DENGAN RINCIAN PRODUK:\n\nREF ID: ${reff_id}\nSN: ${sn}\nID TUJUAN: ${id_tujuan}\nSTATUS: *SUKSES*\n\nKODE PRODUK: *${meta?.sku}*\nNAMA PRODUK: ${meta?.nama}\nHARGA: ${Helper.formattedCurrency(+meta?.harga)}`
                await sock.sendMessage(remoteJid, { text: response })
            }
        }
    } catch (error) {
        Log.error('error send webhook', error)
    }

    return res.status(200).json({
        status: true
    })
}

module.exports = {
  webhookTokopay,
  webhookTokovoucher
}
