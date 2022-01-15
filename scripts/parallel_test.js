const fs = require('fs')
const { spawn, execSync } = require('child_process')
const MAX_PARALLEL = 3
let spawned = []
let done = []

const CombineCoverage = require('./scripts/combine_coverages').sync

const PWD = process.env.PWD

const inGroupsOf = (arr, size) => {
  return arr.reduce((acc, e, i) => {
    return (i % size ? acc[acc.length - 1].push(e) : acc.push([e]), acc)
  }, []);
}

const buildArgs = (integration, ...test_files) => {
  return [
    'run',
    '--rm',
    `--volume=${PWD}/shared_cov:/coverages`,
    '--env-file=.env',
    (integration ? '-e HARDHAT_INTEGRATION_TESTS=1' : null),
    '2pi_contracts',
    'scripts/run_coverage_and_copy_file.sh',
    test_files.join(',')
  ].filter(arg => arg)
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const runOrWait = async (args) => {
  let waiting = spawned.filter(child => !done.includes(child.pid))

  if (waiting.length >= MAX_PARALLEL) {
    while(true) {
      await delay(2000) // wait for 2s

      waiting.forEach((child, i) => {
        if (child.exitCode != null) {
          done.push(child.pid)

          waiting.splice(i, 1) // remove from waiting
        }
      })

      if (waiting.length < MAX_PARALLEL) { break }
    }
  }

  let child = spawn('docker', args, {stdio: [0, 'pipe', fs.openSync('err.out', 'w')]})
  console.log(`Running: `, args[args.length - 1])

  child.on('error', (err) => console.log(err))
  child.on('close', () => done.push(child.pid))
  child.on('exit', () => done.push(child.pid))
  spawned.push(child)
}

const main = async () => {
  let cmdsToBeRun = []

  await execSync('docker build --tag 2pi_contracts .')

  // Add unit test to cmds
  const filtered = fs.readdirSync('./test/contracts/').filter(f => /-test\.js$/.test(f)).map(f => `test/contracts/${f}`)
  inGroupsOf(filtered, 3).forEach(group => {
    cmdsToBeRun.push(buildArgs(false, group))
  })

  // Add integration tests to cmds
  fs.readdirSync('./test/integration/').filter((f) => /-test\.js$/.test(f)).forEach(f => {
    cmdsToBeRun.push(buildArgs(true, `test/integration/${f}`))
  })

  let proms  = []

  let groups = inGroupsOf(cmdsToBeRun, MAX_PARALLEL)
  for (let i = 0; i < groups.length; i++) {
    for (let ii = 0; ii < groups[i].length; ii++) {
      proms.push(runOrWait(groups[i][ii]))
    }
  }

  // await delay(60000) // wait at least 10s to start integration tests
  await Promise.all(proms)

  while (done.length < cmdsToBeRun.length) {
    await delay(5000)
  }

  // Wait for all the process finish
  while(true) {
    if (spawned.filter(child => child.exitCode == null ).length) {
      await delay(2000) // wait for 2s
    } else {
      break
    }
  }
  await Promise.all(proms)

  // let reportPromises = []
  // Replace /app for $PWD
  fs.readdirSync('./shared_cov/').forEach(file => {
    let content = fs.readFileSync(`shared_cov/${file}`, 'utf-8')
    // 3th argument 'g'  is not working...
    const newContent = content.replace(/\/app\/contracts\//g, `${PWD}/contracts/`)

    fs.writeFileSync(`./shared_cov/${file}`, newContent, 'utf-8')
  })


  // await delay(5000) // wait at least 5s to change the files

  console.log('Combinando')
  await CombineCoverage({
    dir: 'coverage',
    pattern: 'shared_cov/*.json',
    print: 'summary',
    reporters: { html: {}, text: {} }
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
