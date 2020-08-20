const Koa = require('koa');
const sse = require('koa-sse-stream');
const app = new Koa;
const {Transform} = require('stream');

const EventEmitter = require('events')

const heos = require('heos-api')

let heosConnection = null

class HeosEmitter extends EventEmitter {}

const heosEmitter = new HeosEmitter();

const playersByPid = {}

class SSEStream extends Transform {
    constructor() {
        super({
            writableObjectMode: true,
        });
    }

    _transform(data, _encoding, done) {
        this.push(`data: ${JSON.stringify(data)}\n\n`);
        done();
    }
}

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
                        .write('player', 'get_volume', {pid: player.pid})
                })
            }
        )
        .on({commandGroup: 'event', command: 'player_now_playing_changed'},
            (resp) => {
                const pid = resp.heos.message.parsed.pid;
                connection
                    .write('player', 'get_play_state', {pid})
                    .write('player', 'get_now_playing_media', {pid})
                    .write('player', 'get_volume', {pid})
            }
        )
        .write('system', 'register_for_change_events', {enable: 'on'})
        .write('system', 'prettify_json_response', { enable: 'on' })
})


app
    .use(sse({
        maxClients: 500,
    }))
    .use(async (ctx, next) => {
        console.log('ctx.path', ctx.path)
        if (ctx.path !== '/sse') {
            return await next();
        }

        const listener = (data) => {
            console.dir({data}, {depth: null})
            try {
                ctx.sse.send(JSON.stringify(data));
            } catch (e) {
                console.error(e.message)
                ctx.sse.end();
            }
        };
        heosConnection.write('player', 'get_players')

        heosEmitter.on("heosEvt", listener);

        // stream.on("close", () => {
        //     heosEmitter.off("heosEvt", listener);
        // });
    })
    .use(ctx => {
        switch (ctx.path) {
            case '/next': {
                const pid = ctx.request.query.pid
                heosConnection.write('player', 'play_next', {pid})
                break;
            }
            case '/previous': {
                const pid = ctx.request.query.pid
                heosConnection.write('player', 'play_previous', {pid})
                break;
            }
            case '/play': {
                const pid = ctx.request.query.pid
                heosConnection.write('player', 'set_play_state', {pid, state: 'play'})
                break;
            }
            case '/pause': {
                const pid = ctx.request.query.pid
                heosConnection.write('player', 'set_play_state', {pid, state: 'pause'})
                break;
            }
            case '/set_volume': {
                const pid = ctx.request.query.pid
                const level = ctx.request.query.level
                heosConnection.write('player', 'set_volume', {pid, level})
                break;
            }
            case '/browse/get_music_sources': {
                heosConnection.write('browse', 'get_music_sources')
                break;
            }
            case '/browse/get_source_info': {
                const sid = ctx.request.query.sid
                heosConnection.write('browse', 'get_source_info', {sid})
                break;
            }
            case '/browse/browse': {
                const browseObj = {sid: ctx.request.query.sid}
                const cid = ctx.request.query.cid
                if (cid !== undefined) {
                    browseObj.cid = cid
                }
                const startItem = ctx.request.query.startItem
                if (startItem !== undefined) {
                    browseObj.range = `${startItem},100`
                }
                heosConnection.write('browse', 'browse', browseObj)
                break;
            }
            case '/browse/add_to_queue': {
                const pid = ctx.request.query.pid
                const sid = ctx.request.query.sid
                const cid = ctx.request.query.cid
                const mid = ctx.request.query.mid
                const aid = ctx.request.query.aid
                heosConnection.write('browse', 'add_to_queue', {pid, sid, cid, mid, aid})
                break;
            }
            default: {
                ctx.status = 404;
                ctx.body = "NOT FOUND";
                ctx.res.end();
                return;
            }
        }
        ctx.status = 200;
        ctx.body = "OK";
        ctx.res.end();
    })
    .listen(8080)
