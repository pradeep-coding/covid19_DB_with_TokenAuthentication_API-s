const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const stateDbToResponseDb = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const districtDbToResponseDb = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT *
                        FROM user
                        WHERE username = '${username}';`;
  const userDetails = await database.get(getUserQuery);
  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      userDetails.password
    );
    if (isPasswordMatched) {
      const payLoad = { username: username };
      const jwtToken = await jwt.sign(payLoad, "My_Secret_Key");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const tokenAuthentication = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "My_Secret_Key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.get("/states/", tokenAuthentication, async (request, response) => {
  const getStatesQuery = `SELECT *
                            FROM state;`;
  const statesArray = await database.all(getStatesQuery);
  response.send(statesArray.map((eachState) => stateDbToResponseDb(eachState)));
});

app.get("/states/:stateId/", tokenAuthentication, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT *
                            FROM state
                            Where state_id = ${stateId};`;
  const state = await database.get(getStateQuery);
  response.send(stateDbToResponseDb(state));
});

app.post("/districts/", tokenAuthentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const insertDistrictQuery = `INSERT INTO district
                                    (district_name, state_id, cases, cured, active, deaths)
                                VALUES ('${districtName}',${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`;
  await database.run(insertDistrictQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  tokenAuthentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT *
                            FROM district
                            WHERE district_id = ${districtId};`;
    const district = await database.get(getDistrictQuery);
    response.send(districtDbToResponseDb(district));
  }
);

app.delete(
  "/districts/:districtId/",
  tokenAuthentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `DELETE
                            FROM district
                            WHERE district_id = ${districtId};`;
    await database.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  tokenAuthentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `UPDATE district
                                 SET  district_name = '${districtName}',
                                    state_id = ${stateId},
                                     cases = ${cases},
                                    cured = ${cured},
                                    active = ${active},
                                    deaths = ${deaths}
                                    WHERE district_id = ${districtId};`;
    await database.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  tokenAuthentication,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStats = `SELECT SUM(cases) AS totalCases,
                            SUM(cured) AS totalCured,
                            SUM(active) AS totalActive,
                            SUM(deaths) AS totalDeaths
                            FROM district
                            WHERE state_id = ${stateId};`;
    const stateStats = await database.get(getStateStats);
    response.send(stateStats);
  }
);

module.exports = app;
