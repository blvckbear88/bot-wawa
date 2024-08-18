const path = require('node:path')
const db = require(path.resolve('src/database/index'))

class Product {
    constructor() {
        db.products.loadDatabase()
        this.product = db.products
    }

    create(data) {
        return new Promise((resolve, reject) => {
            this.product.insert(data, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findAll() {
        return new Promise((resolve, reject) => {
            this.product.find({}, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    findOne(sku) {
        return new Promise((resolve, reject) => {
            this.product.findOne({ sku }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    find(whereClause) {
        return new Promise((resolve, reject) => {
            this.product.find({ ...whereClause }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    update(sku, data) {
        return new Promise((resolve, reject) => {
            this.product.update({ sku }, {
                $set: { ...data },
            }, { multi: true }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }

    destroy(sku) {
        return new Promise((resolve, reject) => {
            this.product.remove({ sku: sku }, {}, (err, num) => {
                if (err) reject(err)
                else resolve(num)
            })
        })
    } 
}

module.exports = Product