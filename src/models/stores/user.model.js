const path = require('node:path')
const db = require(path.resolve('src/database/index'))

class User {
    constructor() {
        db.users.loadDatabase()
        this.user = db.users
    }
    create(data) {
        return new Promise((resolve, reject) => {
            this.user.insert(data, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    findAll() {
        return new Promise((resolve, reject) => {
            this.user.find({}, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    findOne(number) {
        return new Promise((resolve, reject) => {
            this.user.findOne({ number }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    find(whereClause) {
        return new Promise((resolve, reject) => {
            this.user.find({ ...whereClause }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    update(number, data) {
        return new Promise((resolve, reject) => {
            this.user.update({ number }, {
                $set: { ...data },
            }, { multi: true }, (err, doc) => {
                if (err) reject(err)
                else resolve(doc)
            })
        })
    }
    destroy(_id) {
        return new Promise((resolve, reject) => {
            this.user.remove({ _id }, {}, (err, num) => {
                if (err) reject(err)
                else resolve(num)
            })
        })
    } 
}

module.exports = User