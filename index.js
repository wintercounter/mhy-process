import EventEmitter from 'events'
import { spawn } from 'child_process'
import tk from 'tree-kill'

const _onData = Symbol()
const _onError = Symbol()
const instances = new Set()

export default class extends EventEmitter {
    processes = new Map()

    constructor() {
        super()
        instances.add(this)
    }

    spawn(id, [bin, ...cmd]) {
        const p = spawn(bin, cmd, {
            shell: true,
            stdio: process.MHY_ENV === 'ui' ? 'pipe' : 'inherit'
        })
        this.processes.set(id, p)
        p.stdout && p.stdout.on('data', this[_onData])
        p.stderr && p.stderr.on('error', this[_onError])
        if (process.MHY_ENV === 'cli') {
            p.on && p.on('data', this[_onData])
            p.on && p.on('error', this[_onError])
            p.on && signUpForExit(p)
        }
        return p
    }

    [_onData] = line =>
        this.log(line.toString('utf8').trim())

    log(d, type = 'data') {
        this.emit(type, this.processLine(d))
    }

    [_onError] = line =>
        this.log(line.toString('utf8').trim(), 'error')

    processLine(d) {
        return d
    }

    run(name, props = {}) {
        const action = this.actions.find(({ name: n }) => n === name)
        this.emit('action', 'clear')
        this.log(`{blue-fg}Running action ${name}{/blue-fg}`)
        action.onRun(action, props)
    }

    async kill(name) {
        const { pid } = this.processes.get(name)
        this.log(`{red-fg}Killing process ${name}{/red-fg}`)
        await new Promise(resolve => tk(pid, resolve))
        this.log(`{green-fg}Action ${name} killed successfully{/green-fg}`)
    }

    async clean() {
        for (const [, { pid }] of this.processes) {
            await new Promise(resolve => tk(pid, resolve))
        }
    }
}

// Cleanup handling (in case UI is used, it'll be caught there)
const exit = async (err, isErr = false) => {
    err && isNaN(err) && console.log(err);
    process.stdin.resume();

    for (const proc of instances) {
        await proc.clean()
    }

    if (process.MHY_ENV === 'cli') {
        if (!isNaN(err)) {
            process.exit(err)
        } else {
            if (isErr) {
                process.exit(1)
            }
            process.exit(0)
        }
    }
}

const signUpForExit = p => {
    //do something when app is closing
    p.on('exit', exit)

    //catches ctrl+c event
    p.on('SIGINT', exit)
    p.on('SIGTERM', exit)

    // catches "kill pid" (for example: nodemon restart)
    p.on('SIGUSR1', exit)
    p.on('SIGUSR2', exit)

    //catches uncaught exceptions
    p.on('uncaughtException', e => exit(e, true))
}

signUpForExit(process)
