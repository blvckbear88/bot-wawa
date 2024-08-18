# Tokovoucher Bot Project

## Persiapan
1. Nodejs v18 >= higher
2. NPM atau Yarn
2. Git

> Sebelum ke tahap installasi, pastikan kalian sudah meng-clone repo ini di lokal/ server kalian

## Installasi
```sh
$ cd toko-voucher-project
$ npm install
```

## Setup
> Masih pada folder yang sama, jalankan command:

```sh
$ cp .env.example .env
```

> Lalu buka file .env

## Penjelasan singkat mengenai variable pada file .env

1. Pada variable `ADMIN` kalian bisa isi nomor mana yang dapa mengontrol stok produk seperti penambahan produk, penghapusan produk dan pembaharuan produk;
2. Pada variable `TOKOPAY_MERCHANT_ID` dan `TOKOPAY_SECRET_KEY` merupakan credentials akun TOKOPAY kalian;
3. Pada variable `TOKOVOUCHER_MEMBER_CODE`, `TOKOVOUCHER_SECRET_KEY`, `TOKOVOUCHER_SIGNATURE` merupakan credentials akun TOKOVOUCHER kalian;
4. Pada variable `SESSION` adalah nama sesi bot, jika ada kendala dengan sesi bot, sesi bot bisa diganti kapan pun;
5. Pada variable `TOKOVOUCHER` adalah bernilai `true` atau `false`, jika terdapat credentials dan ingin mengaktifkan fitur ppob didalam bot, maka bisa di set ke nilai `true`;
5. Pada variable `TOKOPAY` adalah bernilai `true` atau `false`, jika terdapat credentials dan ingin mengaktifkan fitur payment otomatis didalam bot, maka bisa di set ke nilai `true`;
6. Pada variable `SATTLE_PRICE` merupakan nilai rentang atau keuntungan, misal kalian menambahkan produk `ABCD` dengan harga `3000` didalam bot dan dengan `SATTLE_PRICE` yang telah di set adalah  `1500`, maka harga produk yang berlaku untuk user sebesar `4500`

## Menjalankan Bot
> Gunakan command berikut untuk menjalankan bot:
```sh
$ node index.js
```

## LINK PENTING
1. [TOKOPAY](https://dash.tokopay.id)
2. [TOKOVOUCHER](https://member.tokovoucher.id/)
3. [CONTACT US](https://wa.me/6282299265151) 