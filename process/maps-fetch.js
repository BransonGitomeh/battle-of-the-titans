const { putU16, getU16, getString, putString } = require('@gd-com/utils')

const packets = require("../packets")
const { promisify } = require("util")
console.log("reading the maps")
var wfc = require('wavefunctioncollapse');

var parser = require('xml2json');

var collapsedMap = { positions: [] };
// ref: http://stackoverflow.com/a/1293163/2343
// This will parse a delimited string into an array of
// arrays. The default delimiter is the comma, but this
// can be overriden in the second argument.
function CSVToArray(strData, strDelimiter) {
  // Check to see if the delimiter is defined. If not,
  // then default to comma.
  strDelimiter = (strDelimiter || ",");

  // Create a regular expression to parse the CSV values.
  var objPattern = new RegExp(
    (
      // Delimiters.
      "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +

      // Quoted fields.
      "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +

      // Standard fields.
      "([^\"\\" + strDelimiter + "\\r\\n]*))"
    ),
    "gi"
  );


  // Create an array to hold our data. Give the array
  // a default empty first row.
  var arrData = [[]];

  // Create an array to hold our individual pattern
  // matching groups.
  var arrMatches = null;


  // Keep looping over the regular expression matches
  // until we can no longer find a match.
  while (arrMatches = objPattern.exec(strData)) {

    // Get the delimiter that was found.
    var strMatchedDelimiter = arrMatches[1];

    // Check to see if the given delimiter has a length
    // (is not the start of string) and if it matches
    // field delimiter. If id does not, then we know
    // that this delimiter is a row delimiter.
    if (
      strMatchedDelimiter.length &&
      strMatchedDelimiter !== strDelimiter
    ) {

      // Since we have reached a new row of data,
      // add an empty row to our data array.
      arrData.push([]);

    }

    var strMatchedValue;

    // Now that we have our delimiter out of the way,
    // let's check to see which kind of value we
    // captured (quoted or unquoted).
    if (arrMatches[2]) {

      // We found a quoted value. When we capture
      // this value, unescape any double quotes.
      strMatchedValue = arrMatches[2].replace(
        new RegExp("\"\"", "g"),
        "\""
      );

    } else {

      // We found a non-quoted value.
      strMatchedValue = arrMatches[3];

    }


    // Now that we have our value string, let's add
    // it to the data array.
    arrData[arrData.length - 1].push(strMatchedValue);
  }

  // Return the parsed data.
  return (arrData);
}

function callPython(data, cb) {
  console.log("Calling python module with ", JSON.parse(data).positions.length, "arrays")
  // Use child_process.spawn method from  
  // child_process module and assign it 
  // to variable spawn 
  var { spawn } = require("child_process");
  const python = spawn('python', [
    '/home/branson/Battle of the titans/server/process/processor.py',
    data
  ]);
  let dataToSend;

  // Parameters passed in spawn - 
  // 1. type_of_script 
  // 2. list containing Path of the script 
  //    and arguments for the script  

  // E.g : http://localhost:3000/name?firstname=Mike&lastname=Will 
  // so, first name = Mike and last name = Will 
  python.stdout.on('data', function (data) {
    console.log('Pipe data from python script ...');
    dataToSend = data.toString();
  });
  // in close event we are sure that stream from child process is closed
  python.on('close', (code) => {
    console.log(`child process close all stdio with code ${code}`);
    // send data to browser
    // res.send(dataToSend)
    try {
      console.log("python collapse output", JSON.parse(dataToSend).positions.length, "arrays")
      cb(dataToSend)
    } catch (err) {
      console.log("unable to parse python json output")
      console.log({ pythonRes: dataToSend })
      console.log({ Err: err })

      // retry
      // if (!dataToSend)
      //   callPython(data, cb)
    }

    // cb(JSON.parse())
  });
}

var fs = require('fs'),
  path = require('path'),
  filePath = path.join(__dirname, '../../maps/8*8-test/8*8-10.tmx'),
  targetPath = path.join(__dirname, '../../maps/8*8-test/8*8-10.json');

fs.readFile(filePath, { encoding: 'utf-8' }, function (err, xml) {
  if (!err) {
    console.log('\nXML parsing started');
    // console.log('received data: ' + xml);
    // console.log("input -> %s", xml)

    // xml to json
    var json = parser.toJson(xml);

    const positions = JSON
      .parse(json)
      .map.layer.data.$t

    const cleaned = CSVToArray(positions, ",").map(arr => {
      arr.pop()
      return arr
    })

    // console.log(cleaned)
    const data = new Uint8Array(Buffer.from(JSON.stringify({
      positions: cleaned
    }, null, 5)));

    callPython(JSON.stringify({ positions: cleaned }), (res) => {
      fs.writeFile(targetPath, res, (err) => {
        if (err) throw err;
        console.log('JSON tile data has been saved!');
  
        // run the collapse
        
      });
    })
    


  } else {
    console.log(err);
  }
});


module.exports = {
  packet: packets.MAPS_FETCH,
  process: (uuid, socket, recieve) => {
    console.log(`[${uuid}] >> Send packet code`, packets.OK_GO_LEFT)

    // we know we got a string in recieve !
    const recievedString = getString(recieve)

    console.log(`Asked to fetch maps : ${recievedString.value}`)
    fs.readFile(targetPath, 'utf8', function (err, data) {
      if (err) throw err;

      const uuidPacketID = putU16(1005)
      const uuidPacketData = putString(data)

      const lengthBuffer = Buffer.alloc(4)
      lengthBuffer.writeUInt32LE(uuidPacketID.length + uuidPacketData.length, 0)
      const toSend = Buffer.concat([lengthBuffer, uuidPacketID, uuidPacketData])

      socket.write(toSend)
    });

  }
}