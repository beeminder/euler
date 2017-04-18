var connections = { 
  projecteuler: {
    name: 'Project Euler',
    href: 'https://projecteuler.net/profile/{{username}}.txt',
    parser: function (data){
              return (""+data).split(',')[3];
            }
  }
}

module.exports.connections = connections;