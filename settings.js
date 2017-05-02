var connections = { 
  projecteuler: {
    name: 'Project Euler',
    href: 'https://projecteuler.net/profile/{{username}}.txt',
    parser: function (data) { return (""+data).split(',')[3] },
  }
}

var clientAppName = 'Eulerminder'

module.exports.connections = connections
module.exports.clientAppName = clientAppName