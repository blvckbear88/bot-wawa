const Datastore = require('nedb')
const path = require('node:path')

const db = {}

db.users = new Datastore({
    filename: path.resolve('src/database/stores/users.json')
})

db.products = new Datastore({
    filename: path.resolve('src/database/stores/products.json')
})

db.orders = new Datastore({
    filename: path.resolve('src/database/stores/orders.json')
})

db.carts = new Datastore({
    filename: path.resolve('src/database/stores/carts.json')
})

db.tokopaylog = new Datastore({
    filename: path.resolve('src/database/stores/tokopaylog.json')
})

db.tokovoucherlog = new Datastore({
    filename: path.resolve('src/database/stores/tokovoucherlog.json')
})

module.exports = db