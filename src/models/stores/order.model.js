const path = require('node:path')
const db = require(path.resolve('src/database/index'))

class Order {
    constructor() {
        db.orders.loadDatabase()
        db.carts.loadDatabase()
        this.order = db.orders
        this.cart = db.carts
    }

    create(data) {
        return new Promise((resolve, reject) => {
            this.order.insert(data, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findAll() {
        return new Promise((resolve, reject) => {
            this.order.find({}, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findOne(_id) {
        return new Promise((resolve, reject) => {
            this.order.findOne({ _id }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    find(whereClause) {
        return new Promise((resolve, reject) => {
            this.order.find({ ...whereClause }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    update(_id, data) {
        return new Promise((resolve, reject) => {
            this.order.update({ _id }, {
                $set: { ...data },
            }, { multi: true }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    destroy(_id) {
        return new Promise((resolve, reject) => {
            this.order.remove({ _id }, {}, (err, num) => {
                if (err) reject(err)
                else resolve(num)
            })
        })
    } 

    carts(_id) {
        return new Promise((resolve, reject) => {
            this.cart.find({
                order_id: _id
            }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    } 
}

module.exports = Order