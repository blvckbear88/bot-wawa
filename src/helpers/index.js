const crypto = require('node:crypto')

const Helper = {
    toBoolean: function (value) {
        return (value).toLowerCase() === 'true'
    },
    formattedCurrency: function (value) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        }).format(value)
    },
    formattedDate(date) {
        return new Intl.DateTimeFormat('en-ID', { 
            hour12: false, 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        }).format(new Date(date))
    },
    generateUuidV4: function () {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => (r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8), v.toString(16)))
    },
    generateTrxId: function () {
        return `TRX${[...Array(16)].map(() => crypto.randomBytes(1).toString('hex')[0]).join('')}`
    }
}

module.exports = {
    Helper
}