import * as bunyan from 'bunyan'
import * as cluster from 'cluster'
import * as config from 'config'
import * as http from 'http'
import * as Koa from 'koa'
import * as Router from 'koa-router'
import * as os from 'os'
import * as util from 'util'

import {logger} from './logger'
import {parseBool} from './utils'

export const version = require('./version')
export const app = new Koa()

const router = new Router()

app.proxy = parseBool(config.get('proxy'))
app.on('error', (error) => {
    logger.error(error, 'Application error')
})

async function healthcheck(ctx: Koa.Context) {
    const ok = true
    const date = new Date()
    ctx.body = {ok, version, date}
}

router.get('/.well-known/healthcheck.json', healthcheck)
router.get('/', healthcheck)

app.use(router.routes())

async function main() {
    if (cluster.isMaster) {
        logger.info({version}, 'starting server')
    }

    const server = http.createServer(app.callback())
    const listen = util.promisify(server.listen.bind(server))
    const close = util.promisify(server.close.bind(server))

    let numWorkers = Number.parseInt(config.get('num_workers'))
    if (numWorkers === 0) {
        numWorkers = os.cpus().length
    }
    if (cluster.isMaster && numWorkers > 1) {
        logger.info('spawning %d workers', numWorkers)
        for (let i = 0; i < numWorkers; i++) {
            cluster.fork()
        }
    } else {
        const port = config.get('port')
        await listen(port)
        logger.info('listening on port %d', port)
    }

    const exit = async () => {
        await close()
        return 0
    }

    process.on('SIGTERM', () => {
        logger.info('got SIGTERM, exiting...')
        exit().then((code) => {
            process.exitCode = code
        }).catch((error) => {
            logger.fatal(error, 'unable to exit gracefully')
            setTimeout(() => process.exit(1), 1000)
        })
    })
}

if (module === require.main) {
    main().catch((error) => {
        logger.fatal(error, 'unable to start')
        setTimeout(() => process.exit(1), 1000)
    })
}
