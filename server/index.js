const SSE = require('sse')
const http = require('http')
const EventEmitter = require('events')

const heos = require('heos-api')

let heosConnection = null

class HeosEmitter extends EventEmitter {}

const heosEmitter = new HeosEmitter();

const playersByPid = {}

heos.discoverAndConnect().then(connection => {
    // console.log({connection})
    heosConnection = connection
    connection
        .onAll((resp) => {
            // console.dir({resp}, {depth: null})
            heosEmitter.emit('heosEvt', resp)
        })
        .on({commandGroup: 'player', command: 'get_players'},
            (resp) => {
                resp.payload.forEach(player => {
                    playersByPid[player.pid] = player
                    connection
                        .write('player', 'get_play_state', {pid: player.pid})
                        .write('player', 'get_now_playing_media', {pid: player.pid})
                })
            }
        )
        .on({commandGroup: 'event', command: 'player_now_playing_changed'},
            (resp) => {
                const pid = resp.heos.message.parsed.pid;
                connection
                    .write('player', 'get_play_state', {pid})
                    .write('player', 'get_now_playing_media', {pid})
            }
        )
        .write('system', 'register_for_change_events', {enable: 'on'})
        .write('system', 'prettify_json_response', { enable: 'on' })
})


const server = http.createServer(function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/event-stream'});
    res.end('okay');
});

server.listen(8080, '127.0.0.1', function() {
    const sse = new SSE(server);
    sse.on('connection', function(client) {
        console.log('CONNECTED', {client})
        heosConnection.write('player', 'get_players')
        heosEmitter.on('heosEvt', (evt) => {
            client.send(JSON.stringify(evt))
        })
    });
});