// --------------------------------- 80chars ---------------------------------->
var express = require('express')
var https = require('https')
var http = require('http')
var Sequelize = require('sequelize')
var bodyParser = require('body-parser')
var session = require('express-session')
var SequelizeStore = require('connect-session-sequelize')(session.Store)
var app = express()
app.set('view engine', 'ejs')
app.set('trust proxy', 1)
app.use(bodyParser.urlencoded({ extended: true }))
var User = null
var UserGoal = null
var settings = require('./settings')

// set up a new database using database credentials set in .env
var sequelize = new Sequelize('database', process.env.DB_USER, 
                                          process.env.DB_PASS, {
  host: '0.0.0.0',
  dialect: 'sqlite',
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
  },
  // Security note: the database is saved to the file `database.sqlite` in 
  // the local filesystem. It's deliberately placed in the `.data` directory
  // which doesn't get copied if someone remixes the project.
  storage: '.data/database.sqlite',
})

app.use(session({
  secret: 'beeminder is great',
  store: new SequelizeStore({ db: sequelize }),
  saveUninitialized: false,
  resave: false,
  cookie: { secure: true },
  trustProxie: true,
}))

sequelize.authenticate()
  .then((err) => {

  console.log('Database connection established.')
    // define a new table 'users'
    User = sequelize.define('users', {
      username:     { type: Sequelize.STRING },
      access_token: { type: Sequelize.STRING },
    })
    // define a new table 'usergoals'
    UserGoal = sequelize.define('usergoals', {
      user_id:      { type: Sequelize.INTEGER },
      goal:         { type: Sequelize.STRING },
      linktype:     { type: Sequelize.STRING },
      params:       { type: Sequelize.STRING },
      last_updated: { type: Sequelize.DATE },
      score:        { type: Sequelize.STRING },
    })
    User.sync()
    UserGoal.sync()
  })
  .catch((err) => {
    console.log('Unable to connect to the database: ', err)
  })

app.use(express.static('pub'))

app.get("/connect", (request, response) => {

  if(typeof request.query.access_token == 'undefined' || 
     typeof request.query.username == 'undefined') {
    response.redirect('/')
  } else {
    var access_token = request.query.access_token
    var username = request.query.username
    console.log(username)
    var options = {
      host: 'www.beeminder.com',
      port: 443,
      path: '/api/v1/users/me.json?access_token=' + access_token,
      method: 'GET',
    }

    var req = https.request(options, (res) => {
      res.on('data', (chunk) => {
        var body = JSON.parse(chunk)
        if(typeof body.goals != 'undefined' && body.goals.length != 0) {
          User.findOrCreate({where: {username:username}}).spread((user) => {
            User.update({access_token: access_token}, {where: {id:user.id}})
            request.session.userId = user.id
            response.redirect('/show-links')
          }, (err) => { console.log(err); response.redirect('/') })
        } else {
          response.sendFile(__dirname + '/pub/no-goals.html')
        }
      })
    })
    req.on('error', (e) => {
      console.log('Incorrect Auth attempt: ' + e.message)
      response.redirect('/')
    })
    req.write('')
    req.end()
  }
})

app.get("/setup-link", (request, response) => { response.redirect('/') })

app.get("/show-links", (request, response) => {
  if(typeof request.session.userId == 'undefined' || 
     request.session.userId == null){
    response.redirect('/')
  } else {
    request.session.linktype = null
    User.findOne({where: {id:request.session.userId}}).then( (user) => {
      console.log(user)
      UserGoal.findAll({where:{user_id:request.session.userId}}).then( 
        (data) => {
          response.render(__dirname + '/pub/show-links', 
                          { usergoals: data, user: user, 
                            connections: settings.connections })
        }, (err) => { console.log(err); response.redirect('/') })
    }, (err) => { console.log(err); response.redirect('/') })
  }
})

app.get("/delete-link", (request, response) => {
  if (typeof request.session.userId == 'undefined') {
    response.redirect('/')
  } else {
    var id = request.query.id
    UserGoal.destroy({where: {user_id:request.session.userId, id: id}}).then( 
      (data) => {
        response.redirect('/show-links')
      }, (err) => { console.log(err); response.redirect('/show-links') })
  }
})

app.post("/setup-link", (request, response) => {
  if (typeof request.session.userId == 'undefined') {
    response.redirect('/')
  } else {
    if (!request.session.linktype && !request.body.linktype) {
      response.redirect('/show-links')
    } else {
      if (request.body.linktype && 
          typeof settings.connections[request.body.linktype] == 'undefined') {
        response.redirect('/show-links')
      } else if (request.body.linktype) {
        request.session.linktype = request.body.linktype
      }
      User.findOne({where:{id:request.session.userId}}).then( (user) => {
        var access_token = user.access_token
        var username = user.username
        var linktype = request.session.linktype ? request.session.linktype 
                                                : request.body.linktype
        var goal = request.body.goal
        var params = request.body.params
        var start_value = request.body.start_value ? request.body.start_value : 0

        getBeeminderGoals(user, (goals) => {
          if (!goal) {
            response.render(__dirname + '/pub/setup-link-'+linktype, 
                            { user: user, goals:goals, params: params, 
                              start_value: null, score:null})
          } else {
            getBeeminderGoalValue(user, goal, (curval) => {
              if(start_value < curval) { start_value = curval }
              getSourceValue({ linktype: linktype, 
                               params: JSON.stringify(params)}, (score) => {
                if (goal && linktype && typeof start_value != 'undefined' && 
                    typeof score != 'undefined' && 
                    request.body.submit == 'Start tracking') {
                  updateBeeminderGoal({ goal:goal, linktype: linktype, 
                                        params: JSON.stringify(params), 
                                        start_value: start_value, 
                                        score:score}, 
                                      user, () => { 
                    response.redirect('/show-links') })
                } else {
                  console.log('Here1')
                  response.render(__dirname + '/pub/setup-link-'+linktype, 
                                  { user: user, goal: goal, goals: null, 
                                    params: params, start_value: start_value, 
                                    score: score })
                }
              }, (err) => {
                response.render(__dirname + '/pub/setup-link-'+linktype, 
                                { user: user, goal: goal, goals: goals, 
                                  params: params, start_value: start_value, 
                                  score: null, source_error: err })
              })
            }, (err) => {
              response.render(__dirname + '/pub/setup-link-'+linktype, 
                              { user: user, goal: goal, goals: goals, 
                                params: params, start_value: start_value, 
                                score: null, beeminder_error: err})
            })
          }
        }, () => { response.sendFile(__dirname + '/pub/no-goals.html') })
      }, () => { response.redirect('/') })
    }
  }
})

function updateBeeminderGoal(data, user, callback = ()=>{}) {
  UserGoal.findOrCreate({where: { user_id: user.id, goal: data.goal }})
    .spread((usergoal, created) => {
      if (created) {
        UserGoal.update(data, { where: {id: usergoal.id} })
      }
      
      var options = {
        host: 'www.beeminder.com',
        port: 443,
        path: '/api/v1/users/' + user.username + '/goals/' + data.goal 
              + '/datapoints.json?access_token=' + user.access_token 
              + '&value=' + ( data.score*1 - data.start_value*1 ),
        method: 'POST',
        body: '',
      }
      var req = https.request(options, (res) => {
        var data = ''
        res.on('data', (chunk) => {
          data = data + chunk
        }).on('end', () => {
          data = JSON.parse(data)
          UserGoal.update({ score: data.score, last_updated: Date.now() },
                          { where: {id:usergoal.id}}).then(callback())
        })
      })
      req.on('error', (e) => {
        console.log('problem with request: ' + e.message)
      })
      req.write('')
      req.end()
    })
}

var listener = app.listen(process.env.PORT, () => {
  console.log('app is listening on port ' + listener.address().port)
})

var CronJob = require('cron').CronJob

var interval = 10  // in minutes

new CronJob('0 */' + interval + ' * * * *', () => {
  var starttime = Date.now() + (60 * interval - 24*60*60) * 1000
  UserGoal.findAll({where:{last_updated:{$lt:starttime}}}).then( (usergoals) => {
    usergoals.forEach( (usergoal) => {
      User.findOne({where: {id:user.id}}).then( (user) => {
        getBeeminderGoalValue (user, usergoal.goal, (curval) => {
          getSourceValue (usergoal, (sourceval) => {
            if(curval < sourceval) {
              updateBeeminderGoal({ goal: usergoal.goal, 
                                    linktype: usergoal.linktype, 
                                    params: usergoal.params, 
                                    start_value: curval, score: sourceval }, 
                                  user)
            }
          })
        })
      })
    })
  })
}, null, true, 'UTC')

function getBeeminderGoals (user, callback, error_callback = ()=>{}) {
  var options = {
    host: 'www.beeminder.com',
    port: 443,
    path: '/api/v1/users/me.json?access_token=' + user.access_token,
    method: 'GET',
  }
  var req = https.request(options, (res) => {
    var data = ''
    res.on('data', (chunk) => {
      data = data + chunk
    }).on('end', () => {
      var body = JSON.parse(data)
      if(typeof body.goals != 'undefined' && body.goals.length != 0) {
        callback(body.goals)
      } else {
        error_callback()
      }
    })
  })
  req.on('error', (e) => {
    console.log('problem with request: ' + e.message)
    error_callback(e.message)
  })
  req.write('')
  req.end()
}

function getBeeminderGoalValue (user, goal, callback, error_callback = ()=>{}) {
  var options = {
    host: 'www.beeminder.com',
    port: 443,
    path: '/api/v1/users/' + user.username + '/goals/' + goal 
          + '.json?access_token=' + user.access_token,
    method: 'GET',
  }

  var req = https.request(options, (res) => {
    res.on('data', function (chunk) {
      var body = JSON.parse(chunk)
      if(typeof body.curval != 'undefined') {
          callback(body.curval)
      } else {
        error_callback('Current value not received from Beeminder')
      }
    })
  })
  req.on('error', (e) => {
    console.log('problem with request: ' + e.message)
    error_callback(e.message)
  })
  req.write('')
  req.end()
}

function getSourceValue (goal, callback, error_callback = ()=>{}) {
  var params = JSON.parse(goal.params)
  
  if (typeof settings.connections[goal.linktype] == 'undefined') { 
    return false
  }

  var link = parseLink(settings.connections[goal.linktype]['href'], params)
  var re = /^(?:http|https):\/\/\S*\.\S*/i
  if (!re.test(link)) { return false }
  
  if (link.substr(0,6) == 'https:') { var http_transport = https } 
  else                              { var http_transport = http }

  var req = http_transport.request(link, (res) => {
    var data = ''
    res.on('data', function (chunk) {
      data = data + chunk
    }).on('end', () => {
      var score = settings.connections[goal.linktype].parser(data)
      if(typeof score!= 'undefined' && score*1 == score) {
        callback(score)
      } else {
        error_callback('Incorrect data source')
      }
    })
  })
  
  req.on('error', (e) => {
    console.log('problem with request: ' + e.message)
    error_callback(e.message)
  })
  
  req.write('')
  req.end()
}

function parseLink(link, data) {
  var keys = link.match(/{{(\S*?)}}/)
  keys.forEach( (key) => {
    if (typeof data[key] != 'undefined') {
      link = link.replace('{{'+key+'}}', data[key])
    }
  })
  return link
}