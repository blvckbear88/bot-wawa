const path = require('node:path')
const db = require(path.resolve('src/database/index'))

class Cart {
    constructor() {
        db.carts.loadDatabase()
        this.cart = db.carts
    }

    create(data) {
        return new Promise((resolve, reject) => {
            this.cart.insert(data, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findAll() {
        return new Promise((resolve, reject) => {
            this.cart.find({}, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findOne(_id) {
        return new Promise((resolve, reject) => {
            this.cart.findOne({ _id }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    find(whereClause) {
        return new Promise((resolve, reject) => {
            this.cart.find({ ...whereClause }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    update(_id, data) {
        return new Promise((resolve, reject) => {
            this.cart.update({ _id }, {
                $set: { ...data },
            }, { multi: true }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    destroy(_id) {
        return new Promise((resolve, reject) => {
            this.cart.remove({ _id }, {}, (err, num) => {
                if (err) reject(err)
                else resolve(num)
            })
        })
    } 
}

module.exports = Cart