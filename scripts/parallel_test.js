const fs = require('fs')
const spawn = require('child_process').spawn
const MAX_PARALLEL = 3
let spawned = []
let done = []

const CombineCoverage = require('./combine_coverages').sync

const PWD = process.env.PWD

const main = async () => {
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

    child.on('error', (err) => console.log(err))
    child.on('close', () => done.push(child.pid))
    child.on('exit', () => done.push(child.pid))
    spawned.push(child)
  }

  const inGroupsOf = (arr, size) => {
    return arr.reduce((acc, e, i) => {
      return (i % size ? acc[acc.length - 1].push(e) : acc.push([e]), acc)
    }, []);
  }

  // Run unit
  await fs.readdir('./test/contracts/', (err, files) => {
    if (err)
      console.log('Error leyendo unitarios', err)

    const filtered = files.filter(f => /-test\.js$/.test(f)).map(f => `test/contracts/${f}`)

    inGroupsOf(filtered, 3).forEach(group => {
      runOrWait(buildArgs(false, group))
    })
  })

  await delay(10000) // wait at least 10s to start unit tests

  // Run integration
  await fs.readdir('./test/integration/', (err, files) => {
    if (err)
      console.log('Error leyendo integration', err)

    files.filter((acc, f) => /-test\.js$/.test(f), []).forEach(f => {
      runOrWait(buildArgs(true, `test/integration/${f}`))
    })
  })

  await delay(10000) // wait at least 10s to start integration tests

  // Wait for all the process finish
  while(true) {
    if (spawned.filter(child => child.exitCode == null ).length) {
      await delay(2000) // wait for 2s
    } else {
      break
    }
  }

  let reportPromises = []
  // Replace /app for $PWD
  fs.readdir('./shared_cov/', (rErr, files) => {
    if (rErr)
      console.log('Read error', rErr)

    files.forEach(file => {
      fs.readFile(file, 'utf-8', (err, content) => {
        const newContent = content.replace('/app/contracts/', `${PWD}/contracts/`, 'g')

        reportPromises.push(fs.writeFile(file, newContent, 'utf-8', (wErr) => {
          if (wErr)
            console.log('Write error', wErr)
        }))
      })
    })
  })

  await delay(5000) // wait at least 5s to change the files

  await Promise.all(reportPromises)

  console.log('Combinando')
  await CombineCoverage({
    dir: 'coverage',
    pattern: 'shared_cov/*.json',
    print: 'summary',
    reporters: { html: {} }
  })
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
