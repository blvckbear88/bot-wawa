const path = require('node:path')

module.exports = {
    User: require(
        path.resolve('src/models/stores/user.model.js')
    ),
    Product: require(
        path.resolve('src/models/stores/product.model.js')
    ),
    Order: require(
        path.resolve('src/models/stores/order.model.js')
    ),
    Cart: require(
        path.resolve('src/models/stores/cart.model.js')
    ),
    TokoPayLog: require(
        path.resolve('src/models/stores/tokopaylog.model.js')
    ),
    TokoVoucherLog: require(
        path.resolve('src/models/stores/tokovoucherlog.model.js')
    ),
}