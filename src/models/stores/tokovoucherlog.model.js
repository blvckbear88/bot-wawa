const path = require('node:path')
const db = require(path.resolve('src/database/index'))

class TokoVoucherLog {
    constructor() {
        db.tokovoucherlog.loadDatabase()
        this.log = db.tokovoucherlog
    }
    create(data) {
        return new Promise((resolve, reject) => {
            this.log.insert(data, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    findAll() {
        return new Promise((resolve, reject) => {
            this.log.find({}, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    findOne(number) {
        return new Promise((resolve, reject) => {
            this.log.findOne({ number }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    find(whereClause) {
        return new Promise((resolve, reject) => {
            this.log.find({ ...whereClause }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    update(number, data) {
        return new Promise((resolve, reject) => {
            this.log.update({ number }, {
                $set: { ...data },
            }, { multi: true }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    destroy(_id) {
        return new Promise((resolve, reject) => {
            this.log.remove({ _id }, {}, (err, num) => {
                if (err) reject(err)
                else resolve(num)
            })
        })
    } 
}

module.exports = TokoVoucherLog