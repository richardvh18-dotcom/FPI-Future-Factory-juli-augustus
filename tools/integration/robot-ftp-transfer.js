/**
 * Robot FTP Transfer Service for FPI Future Factory
 * 
 * Verzendt geautomatiseerde wikkelprogramma's (.PRG / .CNC) naar de 
 * Wikkelrobot op BH18 via het interne netwerk.
 * 
 * Gebruik:
 * 1. npm install basic-ftp
 * 2. node robot-ftp-transfer.js --order=N20025429 --diameter=150 --angle=55
 */

const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

// Ip-adres en FTP instellingen van de BH18 Wikkelrobot controller
const ROBOT_CONFIG = {
  host: "192.168.10.18",
  port: 21,
  user: "robot_operator",
  password: "FpiRobotPassword2026",
  remotePath: "/programs/",
};

/**
 * Genereer wikkelprogramma recept voor de robot controller
 */
function generateWindingProgram(orderId, diameter, pressure, windingAngle) {
  return `
; ===================================================
; FPI FUTURE FACTORY - WIKKELROBOT BH18 RECEPT
; Order: ${orderId}
; Datum: ${new Date().toISOString()}
; ===================================================
N10 G90 G21
N20 M03 S1200
N30 SET_MANDREL_DIA = ${diameter}
N40 SET_PRESSURE_BAR = ${pressure}
N50 SET_WINDING_ANGLE = ${windingAngle}
N60 START_WINDING_CYCLE
N70 M05
N80 M30
`.trim();
}

/**
 * Upload programma via FTP naar de robot
 */
async function uploadProgramToRobot(orderId, diameter, pressure = 16, windingAngle = 54.7) {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  const tempFileName = `RECIPE_${orderId}.PRG`;
  const tempFilePath = path.join(__dirname, tempFileName);

  try {
    console.log(`⚙️ Genereren van wikkelprogramma voor order ${orderId} (Ø${diameter}mm, ${pressure}bar)...`);
    const programCode = generateWindingProgram(orderId, diameter, pressure, windingAngle);
    fs.writeFileSync(tempFilePath, programCode, "utf-8");

    console.log(`🔌 Verbinden met BH18 Wikkelrobot op ${ROBOT_CONFIG.host}:${ROBOT_CONFIG.port}...`);
    await client.access({
      host: ROBOT_CONFIG.host,
      port: ROBOT_CONFIG.port,
      user: ROBOT_CONFIG.user,
      password: ROBOT_CONFIG.password,
      secure: false,
    });

    console.log(`⬆️ Uploaden van ${tempFileName} naar ${ROBOT_CONFIG.remotePath}...`);
    await client.uploadFrom(tempFilePath, `${ROBOT_CONFIG.remotePath}${tempFileName}`);

    console.log(`✅ Succesvol geüpload naar Wikkelrobot BH18! Het recept is direct beschikbaar.`);
    return true;
  } catch (err) {
    console.error(`❌ Fout bij FTP overdracht naar Wikkelrobot BH18:`, err.message);
    throw err;
  } finally {
    client.close();
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

// Voorbeeld aanroep indien direct uitgevoerd vanaf CLI
if (require.main === module) {
  const sampleOrderId = process.argv[2] || "N20025429";
  const sampleDia = process.argv[3] || 150;

  uploadProgramToRobot(sampleOrderId, sampleDia, 16, 54.7)
    .then(() => console.log("FTP taak voltooid."))
    .catch((err) => console.error("FTP taak mislukt:", err));
}

module.exports = { uploadProgramToRobot };
