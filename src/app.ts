import express from "express";
import router from "./routes";
import cors from "cors"
import passport from "passport";
import { jwtStrategy } from "./config/token";
import { envConfigs } from "./config/envconfig";
import logger from "./config/logger";
import path from "path";
import axios from "axios";
import swagger from "swagger-ui-express"
import apiDocs from "./config/swagger";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({ origin: "*"}));
passport.use('jwt', jwtStrategy);

app.use("/api-docs", swagger.serve, swagger.setup(apiDocs))

app.use("/", router);



// (async () => {
//   let userIds = ["ae40a072-257c-46ee-b8e6-084a6d9f33e5","5b497525-5f56-48d6-a27c-ddc3b0105d45","58f31914-25fb-4108-807b-83929b8e83e3","40b1eccc-5dc7-46b3-a335-44997f48cc96","2f188a97-01c4-4f7d-95ab-cb5235c25a0c",
//    "1b37052f-3502-4a35-a8fa-ce54358adf54","751aa392-64a9-4367-bafe-68d1d0cb9b70","2f188a97-01c4-4f7d-95ab-cb5235c25a0c","1b37052f-3502-4a35-a8fa-ce54358adf54","1e4d0087-864e-4838-bbf1-9ef20ee831a1"
//   ];
//   let eventName = ["played Game","redeemed Bonus","clicked On avatar","changed Skin"];
//   let eventType = ["Game","Bonus","Avatar","Skin"];
//   let fromAddress = ["0x80bb47Fbd88213A7b5a7BcE841B3d35fc8A0F35D"];
//   let toAddress = ["0xDC868E656F4bD365A8AF17a2C2651EcEa06436dD","0x63FAE906dD2dAC8044d234d500540C8D03fa2b8D","0x05521C3c7fC6A1D68b5300608E2E1d993806F4ae"];
//   let txHash = ["0x71a90bc1bde51509e839ebf7cbc537073e94cec05a589c16257e8a491f7789f3","0xf48f25e88b577fafda8c39b1b946f0d85450aa3dfe7483b9280a45b6af32db13","0x3dd01bd679732032586d5119dcd3baaeac1a8a524ae13705228252dbd6e33f86",
//     "0xcc525c1b7f84d0fe769954c178a042b54b1327a0d0aa03a5280acb0b805ce79c","0x992352428a06760f856fc2be6a37fc274db600d4f53b42d6e025ed7038d96f1b","0x9756c827e34feccb61f2aa40d315bddebc2d372c2e504a28174e3a9d2f13d996","0x07b7830674313ed95c51f8d8c8ad8afa084a8936ebff98bdb6d46edb4fc00d07",
//     "0xe5b39bd405bbaab988292199c1b7b5ef5246e080f4d3251821a6b309adebd661"
//   ];
//   let txn = [];
//   console.log("Hello World");

//   for (let i = 0; i < 100; i++) {

//     // evenId will be random from 1 to 100

//     txn.push({
//       userId:userIds[Math.floor(Math.random()*userIds.length)],
//       eventId: Date.now()*Math.random(),
//       name: eventName[Math.floor(Math.random() * eventName.length)],
//       type: eventType[Math.floor(Math.random() * eventType.length)],
//       eventDetails: "Log Event",
//       transactionhash: txHash[Math.floor(Math.random() * txHash.length)],
//       amount: "0",
//       from: fromAddress[Math.floor(Math.random() * fromAddress.length)],
//       to: toAddress[Math.floor(Math.random() * toAddress.length)],
//     })
//   }

//   await postgreDb.insert(eventData).values(txn).execute();
// })();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Adjust the path based on your project structure

// Route to fetch and render user data
// app.get('/dashboard', async (req, res) => {
//   try {
//       // Make the API call
//       const response = await axios.get(`${process.env.BACKEND_URL}/user/transactions`);
//       const transactions = response.data.data;

//       // Render the EJS template and pass the data
//       res.render('data', { transactions });
//   } catch (error) {
//       console.error('Error fetching transactions:', error);
//       res.status(500).send('An error occurred while fetching transactions.');
//   }
// });



app.listen(envConfigs.port, () => {
  logger.info(`Server started on ${envConfigs.port}`);
})

