const express = require('express')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const {createSession, currencyDictionary, rarityWeights}  = require('./utils') 

const db = new sqlite3.Database(
    './test.db', 
    sqlite3.OPEN_READWRITE, 
    (err) => {if (err) { return console.error(err)}
})

const manageCurrentUser = (token, res, cb) => {
    db.get(`SELECT * from sessions WHERE token='${token}'`,(err, session) => {
        if (err) { return console.error(err)}
        if (session) { 
            db.get(`SELECT * from users WHERE login='${session.login}'`,(err, user) => {
                if (err) { return console.error(err)}
                cb(user)
            })
        } else {
            res.status(403).send({message: 'Не найдена сессия'})
        }
    })
} 

const deleteLot = (id, res) => {
    db.get(`SELECT * FROM lots WHERE id = ?`, [id],(err, row) => {
        if (err) { return console.error(err)}
        if (!row) {
            res.status(404).send('Лот не найден')
            return
        }
        db.run(
            'UPDATE users SET is_trading = ? WHERE id = ?', 
            [false, row.user_id],
            (err) => {if (err) { return console.error(err)}}
        )
        db.run(`DELETE FROM lots WHERE id = ?`, [id],(err) => {
            if (err) { return console.error(err)}
        })
    })

    db.each(`SELECT * FROM offers WHERE lot_id = ${id}`,(err, row) => {
        if (err) { return console.error(err)}
        if (!row) return
        db.run(
            'UPDATE users SET is_trading = ? WHERE id = ?', 
            [false, row.user_id],
            (err) => {if (err) { return console.error(err)}}
        )
        db.run(`DELETE FROM offers WHERE lot_id = ${id}`,(err) => {
            if (err) { return console.error(err)}
        })
    })
    
    res.status(200).send('ok')
}

const hour = 60 * 60 * 1000

//db.run('CREATE TABLE users(id INTEGER PRIMARY KEY, login, password, maxcoins, nissomani, piski, ilushekels, rudies )')
//db.run('CREATE TABLE sessions(id INTEGER PRIMARY KEY, login, token)')
//db.run('CREATE TABLE lots(id INTEGER PRIMARY KEY, collection_item_id, user_id)')
// db.run('CREATE TABLE offers(id INTEGER PRIMARY KEY, lot_id, user_id, content)')
//db.run('CREATE TABLE history(id INTEGER PRIMARY KEY, sum, giver, reciever, comment, date)')
//db.run('CREATE TABLE cards(id INTEGER PRIMARY KEY, name, rarity, picture, description, is_unique, is_taken, is_action)')//
//db.run('CREATE TABLE collectionItems (id INTEGER PRIMARY KEY, owner_id, card_id, number, FOREIGN KEY(owner_id) REFERENCES users(id), FOREIGN KEY(card_id) REFERENCES cards(id))')
//db.run('DROP TABLE lots')
//db.run('ALTER TABLE users ADD is_trading ') 
// db.run('INSERT INTO cards(name, rarity, picture, description, is_unique, is_taken, is_action) VALUES(?,?,?,?,?,?,?)',
//                 ['Политические взгляды Рудольфа', 'epic', 'rudolf5', "Убивать прямо сейчас! Оправдать убийц первой степени! Практикуйте каннибализм! Ешьте дерьмо! Разврат — вот мои убеждения! Порок — вот моя жизнь!", false, false, false],
//                 (err) => {if (err) { return console.error(err)}}
//             )
// db.run('DELETE from lots')
// db.run('DELETE from offers')
//  db.run('UPDATE users SET is_trading = 0')
// db.run('UPDATE cards SET picture = "rudolf4" WHERE id = 17')

const app = express()
const port = 8081

app.use(express.json())
app.use(cors())

app.listen(port, () => {
    console.log('Работаем на порте ' + port)
})


app.get('/users', (req, res) => {
    db.all(`SELECT login, id FROM users`,(err, rows) => {
        if (err) { return console.error(err)}
        res.status(200).send(rows)
    })
})

app.post('/open-pack', (req, res) => {
    const token = req.get('token')
    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.all(`SELECT * FROM cards`,(err, cards) => {
                if (err) { return console.error(err)}
                const intervals = []
                const picks = []
                let range = 0
                cards.forEach(({rarity}) => {
                    range += rarityWeights[rarity]
                    intervals.push(range)
                })
        
                for (let i=0; i < 5; i++) {
                    const pick = Math.random()*range
                    const index = intervals.findIndex((val) => {
                        return val > pick
                    })
                    const pickedCard = cards[index]
                    picks.push(pickedCard)
                    console.log(`Выпала карта ${pickedCard.name} (${pickedCard.rarity})`)
                }

                const uniquePicks = []

                picks.forEach((card) => {
                    const foundItem = uniquePicks.find(
                        ({cardId}) => cardId === card.id
                    )
                    if (foundItem) {
                        foundItem.number ++
                    } else {
                        uniquePicks.push({cardId: card.id, number: 1})
                    }
                })

                uniquePicks.forEach((card) => {
                    db.get(`SELECT * FROM collectionItems WHERE owner_id = ? AND card_id = ?`,[user.id, card.cardId], (err,foundItem ) => {
                        if (err) { return console.error(err)}
                        if (!!foundItem) {
                            db.run('UPDATE collectionItems SET number = ? WHERE id = ?',[foundItem.number + card.number, foundItem.id])
                        } else {
                            db.run(
                                'INSERT INTO collectionItems(owner_id, card_id, number) VALUES(?,?,?)',
                                [user.id, card.cardId, card.number ],
                                (err) => {if (err) { return console.error(err)}}
                            )
                        }
                    })
                    
                })
                res.status(200).send(picks)
            })
        } else {
            res.status(403).send({message: 'Open pack не найдет пользователь'})
        }
    })
})

app.get('/collection', (req, res) => {
    const token = req.get('token')

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.all(`SELECT * FROM collectionItems WHERE owner_id = ?`,[user.id],(err, items) => {
                if (err) { return console.error(err)}
                db.map(`SELECT * FROM cards`, (err, cards) => {
                    if (err) { return console.error(err)}
                    const collection = items.map(({card_id, number, id}) => { 
                            return {
                                id,
                                card: cards[card_id],
                                number
                            }
                        }
                    )
                    res.status(200).send({collection, allCardsCount: Object.entries(cards).length})
                })
            })
        } else {
            res.status(403).send({message: 'Недоступно'})
        }
    })
})

app.get('/cards', (req, res) => {
    db.all(`SELECT * FROM cards`,(err, rows) => {
        if (err) { return console.error(err)}
        res.status(200).send(rows)
    })
})

app.get('/me', (req, res) => {
    const token = req.get('token')

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            res.status(200).send(user)
            const now = new Date()
            const timePassed = now - user.last_update
            if (timePassed > hour) {
                const earnings = Math.floor(timePassed/hour)
                db.run(`UPDATE users SET last_update = ? WHERE id = ?`, [now, user.id])
                db.run(`UPDATE users SET piski = ? WHERE id = ?`, [user.piski + earnings, user.id])
            }
        } else {
            res.status(403).send({message: 'Недоступно'})
        }
    })
})

app.post('/login', (req, res) => {
    const {login, password} = req.body
    console.log('Логинимся ' + login)
    db.get(`SELECT * from users WHERE login='${login}' And password='${password}'`,(err, row) => {
        if (err) { return console.error(err)}
        if (row) { 
            const token = createSession(row.login, db)
            console.log('Норм')
            res.status(200).send({ token })
        } else {
            res.status(403).send({message: 'Неверный логин или пароль'})
        }
    })

})

app.post('/user', async (req, res) => {
    const {login, password, confirmPassword} = req.body

    if (!login) {
        res.status(400).send({message: 'Введи логин'})
        return
    }

    if (!password) {
        res.status(400).send({message: 'Введи пароль'})
        return
    }

    if (password !== confirmPassword) {
        console.log(`Пароль не совпадает`);
        res.status(400).send({message: 'Пароль не совпадает'})
        return
    }

    db.get(`SELECT * from users WHERE login='${login}'`,(err, row) => {
        if (err) { return console.error(err)}
        if (row) { 
            console.log(`Такой пользователь уже есть `, row);
            res.status(400).send({message: 'Такой пользователь уже есть'})
        } else {
            db.run(
                'INSERT INTO users(login, password, maxcoins, nissomani, piski, ilushekels, rudies) VALUES(?,?,?,?,?,?,?)',
                [login, password, 1000, 100, 100, 100, 100],
                (err) => {if (err) { return console.error(err)}}
            )
            const token = createSession(login, db)
            res.status(200).send({ token })
        }
    })
})

app.put('/transite', (req, res) => {
    const token = req.get('token')
    const {recieverId, sum, currency, comment} = req.body

    manageCurrentUser(token, req, (giver) => {
        if (giver) {
            db.get(`SELECT * from users WHERE id='${recieverId}'`,(err, reciever) => {
                if (err) { return console.error(err)}
                if (reciever) {
                    db.run(`UPDATE users SET ${currency} = ? WHERE id = ?`, [reciever[currency] + sum, recieverId])
                    db.run(`UPDATE users SET ${currency} = ? WHERE id = ?`, [giver[currency] - sum, giver.id])
                    db.run(
                        'INSERT INTO history(sum, giver, reciever, comment, date,currency) VALUES(?,?,?,?,?,?)',
                        [sum, giver.login, reciever.login, comment, new Date(), currency],
                        (err) => {if (err) { return console.error(err)}}
                    )
                    console.log(`${giver.login} переводит ${reciever.login} ${sum} ${currencyDictionary[currency]}`)

                    res.status(200).send('ok')
                } 
            })
        } 
    })
})


app.get('/history', (req, res) => {
    const token = req.get('token')

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.all(`SELECT * from history WHERE giver='${user.login}' OR reciever='${user.login}'`,(err, rows) => {
                if (err) { return console.error(err)} 
                res.status(200).send(rows)          
            })
        } else {
            res.status(404).send({message: 'Пользователь не найден'})
        }
    })
})

app.get('/lots', (req, res) => {
    db.all(`SELECT * FROM lots`,(err, rows) => {
        if (err) { return console.error(err)}
        db.map(`SELECT * FROM collectionItems`, (err, collectionItems) => {
            if (err) { return console.error(err)}
            db.map(`SELECT * FROM cards`, (err, cards) => {
                if (err) { return console.error(err)}
                db.map(`SELECT * FROM users`, (err, users) => {
                    if (err) { return console.error(err)}
                    const lots = rows.map(({collection_item_id, id, user_id}) => { 
                            const collectionItem = collectionItems[collection_item_id]
                            return {
                                id,
                                user: users[user_id],
                                item: {
                                    ...collectionItem,
                                    card: cards[collectionItem.card_id]
                                },
                            }
                        }
                    )
                    res.status(200).send(lots)
                })
            })
        })
    })
})

app.get('/lots/:id', (req, res) => {
    const id = req.params.id
    db.get(`SELECT * FROM lots WHERE id = ?`, [id],(err, row) => {
        if (err) { return console.error(err)}
        if (!row) {
            res.status(404).send('Лот не найден')
            return
        }
        db.get(`SELECT * FROM collectionItems WHERE id = ?`,[row.collection_item_id], (err, collectionItem) => {
            if (!collectionItem) {
                res.status(404).send('Карта в коллекции не найдена')
                return
            }
            if (err) { return console.error(err)}
            db.get(`SELECT * FROM cards WHERE id = ?`, [collectionItem.card_id], (err, card) => {
                if (err) { return console.error(err)}
                db.get(`SELECT * FROM users WHERE id = ? `,[row.user_id], (err, user) => {
                    if (err) { return console.error(err)}
                    const lot = {
                            id: row.id,
                            user,
                            item: {
                                ...collectionItem,
                                card
                            },
                        }
                    res.status(200).send(lot)
                })
            })
        })
    })
})

app.delete('/lots/:id', (req, res) => {
    const id = req.params.id
    deleteLot(id, res)
})

app.get('/my-lots', (req, res) => {
    const token = req.get('token')

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.all(`SELECT * FROM lots WHERE user_id = ?`,[user.id],(err, rows) => {
                if (err) { return console.error(err)}
                res.status(200).send(rows)
            })
        } else {
            res.status(404).send({message: 'Пользователь не найден'})
        }
    })
    
})

app.post('/lots', (req, res) => {
    const token = req.get('token')
    const lot = req.body.collectionItem

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.run(
                'INSERT INTO lots(collection_item_id, user_id) VALUES(?,?)',
                [lot, user.id],
                (err) => {if (err) { return console.error(err)}}
            )
            db.run(
                'UPDATE users SET is_trading = ? WHERE id = ?', 
                [true, user.id],
                (err) => {if (err) { return console.error(err)}}
            )
            res.status(200).send('ok')
        } else {
            res.status(404).send({message: 'Пользователь не найден'})
        }
    })
})

app.post('/offers', (req, res) => {
    const token = req.get('token')
    const lot_id = req.body.lotId
    const content = JSON.stringify(req.body.content)

    manageCurrentUser(token, res, (user) => {
        if (user) { 
            db.run(
                'INSERT INTO offers(lot_id, user_id, content) VALUES(?,?, ?)',
                [lot_id, user.id, content],
                (err) => {if (err) { return console.error(err)}}
            )
            db.run(
                'UPDATE users SET is_trading = ? WHERE id = ?', 
                [true, user.id],
                (err) => {if (err) { return console.error(err)}}
            )
            res.status(200).send('ok')
        } else {
            res.status(404).send({message: 'Пользователь не найден'})
        }
    })
})

app.post('/accept', (req, res) => {
    const lotId = req.body.lot
    const offerId = req.body.offer
    db.get(`SELECT * FROM lots WHERE id = ?`, [lotId], (err, lot) => {
        if (err) { return console.error(err)}
        if (!lot) {
            res.status(404).send('Лот не найден')
            return
        }
        db.get(`SELECT * FROM offers WHERE id = ? `,[offerId], (err, offer) => {
            if (err) { return console.error(err)}
            if (!offer) {
                res.status(404).send('Оффер не найден')
                return
            }
            db.get(`SELECT * FROM users WHERE id = ? `,[lot.user_id], (err, lotCreater) => {
                if (err) { return console.error(err)}
                db.get(`SELECT * FROM users WHERE id = ? `,[offer.user_id], (err, offerCreater) => {
                    if (err) { return console.error(err)}
                    Object.entries(JSON.parse(offer.content)).forEach(([key, value]) => {
                        if(key === 'cards') {
                            const uniqueItems = []
                            value.forEach(item => {
                                const foundItem = uniqueItems.find(
                                    ({itemId}) => itemId === item.id
                                )
                                if (foundItem) {
                                    foundItem.numberToGive ++
                                } else {
                                    uniqueItems.push({
                                        itemId: item.id, 
                                        cardId: item.card.id,
                                        numberToGive: 1,
                                        newNumberForGiver: item.number
                                    })
                                }
                            })
                            uniqueItems.forEach(item => {
                                if (item.newNumberForGiver <= 0) {
                                    db.run(`DELETE FROM collectionItems WHERE id = ${item.itemId}`)
                                } else {
                                    db.run(`UPDATE collectionItems SET number = ? WHERE id = ?`,[item.newNumberForGiver, item.itemId])
                                }
                                db.get(`SELECT * FROM collectionItems WHERE owner_id = ? AND card_id = ?`,[lotCreater.id, item.cardId], (err,foundItem ) => {
                                    if (err) { return console.error(err)}
                                    if (!!foundItem) {
                                        db.run('UPDATE collectionItems SET number = ? WHERE id = ?',[foundItem.number + item.numberToGive, foundItem.id])
                                    } else {
                                        db.run(
                                            'INSERT INTO collectionItems(owner_id, card_id, number) VALUES(?,?,?)',
                                            [lotCreater.id, item.cardId, item.numberToGive ],
                                            (err) => {if (err) { return console.error(err)}}
                                        )
                                    }
                                })
                            })
                        } else {
                            db.run(`UPDATE users SET ${key} = ? WHERE id = ?`, [lotCreater[key] + value, lotCreater.id])
                            db.run(`UPDATE users SET ${key} = ? WHERE id = ?`, [offerCreater[key] - value, offerCreater.id])
                        }
                    })
                    db.get(`SELECT * from collectionItems WHERE id = ?`, [lot.collection_item_id], (err, lotCreatorCollectionItem) => {
                            if (err) { return console.error(err)}
                            db.get(
                                `SELECT * from collectionItems WHERE owner_id = ? AND card_id = ?`, 
                                [offerCreater.id, lotCreatorCollectionItem.card_id], 
                                (err, offerCreatorCollectionItem) => {
                                    if (err) { return console.error(err)}
                                    if (!!offerCreatorCollectionItem) {
                                        db.run(
                                            'UPDATE collectionItems SET number = ? WHERE id = ?',
                                            [offerCreatorCollectionItem.number + 1, offerCreatorCollectionItem.id]
                                        )
                                    } else {
                                        db.run(
                                            'INSERT INTO collectionItems(owner_id, card_id, number) VALUES(?,?,?)',
                                            [offerCreater.id, lotCreatorCollectionItem.card_id, 1 ],
                                            (err) => {if (err) { return console.error(err)}}
                                        )
                                    }
                                })
                            if (lotCreatorCollectionItem.number > 1) {
                                db.run(
                                    'UPDATE collectionItems SET number = ? WHERE id = ?',
                                    [lotCreatorCollectionItem.number - 1, lotCreatorCollectionItem.id]
                                )
                            } else {
                                db.run(`DELETE FROM collectionItems WHERE id = ${lotCreatorCollectionItem.id}`,(err) => {
                                    if (err) { return console.error(err)}
                                })
                            }
                        })
                    deleteLot(lotId, res)
                })
            })
        })
    })
})

app.get('/offers/:id', (req, res) => {
    const id = req.params.id
    db.all(`SELECT * FROM offers WHERE lot_id = ${id}`,(err, rows) => {
        if (err) { return console.error(err)}
        db.map(`SELECT * FROM users`,(err, users) => {
            if (err) { return console.error(err)}
            res.status(200).send(rows.map((offer) => ({
                login: users[offer.user_id].login,
                ...offer
            })))
        })
    })
})

app.delete('/offers/:id', (req, res) => {
    const id = req.params.id
    db.get(`SELECT * FROM offers WHERE id = ${id}`,(err, row) => {
        if (!row) {
            res.status(404).send('Оффер не найден')
            return
        }
        if (err) { return console.error(err)}
        db.run(
            'UPDATE users SET is_trading = ? WHERE id = ?', 
            [false, row.user_id],
            (err) => {if (err) { return console.error(err)}}
        )
        db.run(`DELETE FROM offers WHERE lot_id = ${id}`,(err) => {
            if (err) { return console.error(err)}
        })
        res.status(200).send('ok')
    })
})
