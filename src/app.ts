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

export const app = new Koa()
export const router = new Router()
export const version = require('./version')

app.proxy = parseBool(config.get('proxy'))
app.on('error', (error) => {
    logger.error(error, 'application error')
})

async function healthcheck(ctx: Koa.Context) {
    const ok = true
    const date = new Date()
    ctx.body = {ok, version, date}
}

router.get('/', healthcheck)
router.get('/.well-known/healthcheck.json', healthcheck)

app.use(router.routes())

async function main() {
    if (cluster.isMaster) {
        logger.info({version}, 'starting service')
    }

    const server = http.createServer(app.callback())
    const listen = util.promisify(server.listen).bind(server)
    const close = util.promisify(server.close).bind(server)

    let numWorkers = Number.parseInt(config.get('num_workers'), 10)
    if (numWorkers === 0) {
        numWorkers = os.cpus().length
    }
    const isMaster = cluster.isMaster && numWorkers > 1

    if (isMaster) {
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
        if (!isMaster) {
            await close()
        }
        return 0
    }

    process.on('SIGTERM', () => {
        logger.info('got SIGTERM, exiting...')
        exit().then((code) => {
            process.exit(code)
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
