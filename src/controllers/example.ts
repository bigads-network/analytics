import dbservices from "../services/dbservices";
import TransactionsXDC from "../services/dbservices/transactionsXDC";
import User from "./user";

const testTheController = async ()=>{
    // const count = await dbservices.User.counts()
    // const getGames = await dbservices.User.getGames()
    // console.log("Count of users:", count);
    // console.log("Games:", getGames);

//     const transactionCount = await TransactionsXDC.getDailyTransactionCounts();
//     const dailyActiveUsers = await TransactionsXDC.getDailyActiveUsers();
//     console.log("Daily Transaction Counts:", transactionCount);
//     console.log("Daily Active Users:", dailyActiveUsers);
}

testTheController()



// Count of users: { users: 419684, games: 5, events: 10, transactions: 3942078 }
// Games: [
//   {
//     id: 1,
//     gameId: 'game_Y46HAQ31',
//     Gamename: 'Spider Hero Man 3d',
//     Gametype: 'City Fighting Action',
//     description: 'Get ready for the ultimate Spider Hero 3D fighting experience! Step into the shoes of a legendary superhero and take on crime in an open-world city full of gangsters, villains, and dangerous bosses. Use your spider powers, web-slinging skills, and high-flying combat moves to restore justice and save the city!',
//     createdAt: 2025-03-26T20:35:45.229Z,
//     transactionCount: '1181488',
//     usersPlayed: '157007'
//   },
//   {
//     id: 2,
//     gameId: 'game_FWPBGLKC',
//     Gamename: 'Modern Gun Shooter Sniper',
//     Gametype: 'shooting game',
//     description: 'The enemy is now advancing. Hide behind obstacles and shoot while moving.',
//     createdAt: 2025-03-26T20:51:41.031Z,
//     transactionCount: '393838',
//     usersPlayed: '79772'
//   },
//   {
//     id: 3,
//     gameId: 'game_QXWQKTJ8',
//     Gamename: 'The Furious Bird Hunter Game',
//     Gametype: 'Bird Hunter Game',
//     description: 'The typical Bird shooting game for entertainment.',
//     createdAt: 2025-03-26T20:55:15.279Z,
//     transactionCount: '788919',
//     usersPlayed: '120394'
//   },
//   {
//     id: 4,
//     gameId: 'game_VR8MKK6Z',
//     Gamename: 'Spider Fighter man hero',
//     Gametype: 'fighting game',
//     description: 'Spider hero superhero fighting missions in the America city of the superhero captain game and spider fighter fighting game.Spider SUPERHERO WITH FIST AND SHIELD .You play as a fictional character from comic books, a mercenary with the superhuman ability of regeneration and physical prowess. Like spider hero or spider fighter with superhero strength you fight criminal gangsters and their bosses. Enjoy real time combat fight both on the ground and air like a true Super Hero in the contest of future evolution fighting. Spider hero super fighter 2 of the spider superhero game is the first spider fighter who joined the team of super fighters of the America spider game the spider fight game.',
//     createdAt: 2025-03-26T20:57:24.676Z,
//     transactionCount: '788607',
//     usersPlayed: '119726'
//   },
//   {
//     id: 5,
//     gameId: 'game_WKC7KDJB',
//     Gamename: 'Dinosaur Hunting Simulator 3D',
//     Gametype: 'shooting game',
//     description: 'Show your shooting skills and kill dinosaurs for you survival in this amazing Dinosaur Hunting Simulator 3D game. You have been trapped in a forest and many wild dinosaurs have launched an attack on you. You have to survive under this sever attack. So, be ready, keep grip on your trigger and start killing dinosaurs before they kill you. As a pro sniper, you should target their head shoots so the chances of their escape can be minimized. Your hunting skills will be tested in real sense. In this action packed simulation, you have the chance to prove yourself the best shooter of the town. This is very adventurous for players, because only they or dinosaurs will survive in this warfare. So this will be a most exciting game of 2016 for you. Download this free game and start killing you enemies.',
//     createdAt: 2025-03-26T21:00:00.073Z,
//     transactionCount: '789226',
//     usersPlayed: '119741'
//   }
// ]

// Daily Transaction Counts: {
//   count: 4,
//   data: [
//     { day: '2025-06-01', total_transactions: '9' },
//     { day: '2025-06-02', total_transactions: '1927' },
//     { day: '2025-06-03', total_transactions: '3171' },
//     { day: '2025-06-04', total_transactions: '505' }
//   ]
// }
// Daily Active Users: {
//   count: 4,
//   data: [
//     { day: '2025-06-01', daily_active_users: '2' },
//     { day: '2025-06-02', daily_active_users: '454' },
//     { day: '2025-06-03', daily_active_users: '632' },
//     { day: '2025-06-04', daily_active_users: '94' }
//   ]
// }
