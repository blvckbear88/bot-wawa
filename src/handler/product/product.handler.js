process.on('uncaughtException', async (err, origin) => {
    console.log('error [product handler]', err)
});

require('dotenv').config()

const path = require('node:path')

const { Product } = require(
    path.resolve('src/models/index')
)

const { Sock } = require(
    path.resolve('src/config/queue.js')
)

const ProductModel = new Product()

const handler = async (sock, m, conversation, remoteJid) => {
    Sock.sock = sock
    
    var products  = await ProductModel.findAll()
    var { SATTLE_PRICE } = process.env

    switch (true) {
        case (/\/listproduk$/i.test(conversation)):
            var response = 'Cara order: */cart SKU qty*\n\nStock Produk Otomatis:'

            if (products.length > 0) {
                products.map(({
                    nama,
                    durasi,
                    sku,
                    harga,
                    credentials
                }) => {
                    response += `\n\nProduk : ${nama}\nDurasi : ${durasi}\nSKU : ${sku}\nHarga : ${harga+ +SATTLE_PRICE}\nStok: ${credentials.length || 0}`
                })
            } else {
                response += '\nProduk kosong'
            }
            await Sock.sendTextMessage(remoteJid, { text: response })
            break;
        case ((/\/addproduk/i.test(conversation)) && conversation.startsWith('/addproduk')): {
            if (m.isAdmin) {
                var response;
                
                if (conversation.split(' ').length < 2 || conversation.split('/addproduk ')[1].split('|').length < 5) {
                    response = 'Format tidak sesuai!\n\nContoh: */addproduk namaproduk|durasi|sku|harga|credentials*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (isNaN(+conversation.split('/addproduk ')[1].split('|')[3])) {
                    response = 'Format harus berupa nominal angka!\n\nContoh: */addproduk VIU PRIV BIASA|3 BULAN|VIU1|2000|username: admin, password: admin*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if ([...products.map(({ sku }) => sku)].includes(conversation.split('/addproduk ')[1].split('|')[2])) {
                    response = 'SKU sudah ada dalam produk sebelumnya!\n\nContoh: */addproduk VIU PRIV BIASA|3 BULAN|VIU1|2000|username: admin, password: admin*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    await ProductModel.create({
                        nama: conversation.split('/addproduk ')[1].split('|')[0],
                        durasi: conversation.split('/addproduk ')[1].split('|')[1],
                        sku: conversation.split('/addproduk ')[1].split('|')[2],
                        harga: +conversation.split('/addproduk ')[1].split('|')[3],
                        credentials: conversation.split('/addproduk ')[1].split('|').slice(4),
                    })
                    
                    response = `Produk berhasil ditambahkan!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }

                return
            } else {
                let response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break;
        case ((/\/updateproduk/i.test(conversation)) && conversation.startsWith('/updateproduk')): {
            if (m.isAdmin) {
                var response;
                
                if (conversation.split(' ').length < 3 || conversation.split(/\/updateproduk\ +\w+ /)[1].split('|').length < 5) {
                    response = 'Format tidak sesuai!\n\nContoh: */updateproduk SKU namaproduk|durasi|sku|harga|credentials*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (![...products.map(({ sku }) => sku)].includes(conversation.split('/updateproduk ')[1].split(' ')[0])) {
                    response = 'SKU tidak ada dalam produk!\n\nContoh: */updateproduk VIU1 VIU PRIV BIASA|3 BULAN|VIU1|5000|username: admin, password: admin*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (isNaN(+conversation.split(/\/updateproduk\ +\w+ /)[1].split('|')[3])) {
                    response = 'Format harus berupa nominal angka!\n\nContoh: */updateproduk SKU VIU PRIV BIASA|4 BULAN|VIU1|5000|username: admin, password: admin*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    await ProductModel.update(conversation.split('/updateproduk ')[1].split(' ')[0], {
                        nama: conversation.split(/\/updateproduk\ +\w+ /)[1].split('|')[0],
                        durasi: conversation.split(/\/updateproduk\ +\w+ /)[1].split('|')[1],
                        sku: conversation.split(/\/updateproduk\ +\w+ /)[1].split('|')[2],
                        harga: +conversation.split(/\/updateproduk\ +\w+ /)[1].split('|')[3],
                        credentials: conversation.split(/\/updateproduk\ +\w+ /)[1].split('|').slice(4),
                    })

                    response = `Produk berhasil di-perbaharui!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }

                return
            } else {
                let response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break;
        case ((/\/delproduk/i.test(conversation)) && conversation.startsWith('/delproduk')): {
            if (m.isAdmin) {
                var response;

                if (conversation.split(' ').length < 2) {
                    response = 'Format tidak sesuai!\n\nContoh: */delproduk SKU*'
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else if (![...products.map(({ sku }) => sku)].includes(conversation.split(' ')[1])) {
                    response = `SKU Produk tidak ditemukan!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                } else {
                    var sku = conversation.split(' ')[1]
                    await ProductModel.destroy(sku)

                    response = `Produk dengan SKU *${sku}* berhasil dihapus!`
                    await Sock.sendTextMessage(remoteJid, { text: response })
                }
                return
            } else {
                let response = `Fitur tidak dapat diakses oleh selain admin/ owner!`
                await Sock.sendTextMessage(remoteJid, { text: response })
                return
            }
        }
            break;
        default:
            break;
    }
}

module.exports = { handler }