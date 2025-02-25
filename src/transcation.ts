import DiamSdk from "diamnet-sdk";
// import { server } from "../web3/balance/getDiamanteBalance";
// import { createWallets, generatePrivateKey } from "../web3/wallets/diamante";
// import { homeOrWalletButton } from "../bot/buttons/telegramMsgButton";
import crypto from "crypto";
import axios from "axios";


// diamnet saAddresssssssssssssssss GALUXZKE665VGOQTMAJ6ASKDISDB77AYLLFRIDJ55SGDGENMRNHZROFX secret SAYGMXWMXPVS4JQ2SAIR3EHSN6APKB76EVRYM2DI77Y2AJEYXV4P3RBS


const server = new DiamSdk.Aurora.Server("https://diamtestnet.diamcircle.io/");
function stringToRawEd25519Seed(input) {
    // Step 1: Normalize the string to UTF-8 bytes
    const utf8Bytes = Buffer.from(input, "utf-8");
  
    // Step 2: Hash the bytes using SHA-256 to get 32 bytes
    //@ts-ignore
    const hash = crypto.createHash("sha256").update(utf8Bytes).digest();
  
    // Step 3: Ensure the hash is exactly 32 bytes (this is guaranteed with SHA-256)
    if (hash.length !== 32) {
      throw new Error("Unexpected hash length");
    }
  
    return hash;
  }
function generatePrivateKey(){
    // const source = telegramId + config.SECRET_KEY;
    const privateKey = stringToRawEd25519Seed("testingggg");
    return privateKey;
  };
  
//   GCWPJEECSG4GDFYCI3HX74432Q3TYJV6XZNBCUMC42UPL6VJU7PD73MH
// export const transferByDiamante = async (
//   receiverAddress: string,
// ) => {
//   try {
//     console.log("data transaction..", receiverAddress)

//     const seedPhrase = generatePrivateKey();
//     console.log("privateKey hash...", seedPhrase);
//     var sourceKeys = DiamSdk.Keypair.fromRawEd25519Seed(seedPhrase);
// console.log(sourceKeys.publicKey() ,"generated keys")
//     //   const BALNCECREDITED :any=  axios.get(`https://friendbot.diamcircle.io/?addr=${sourceKeys.publicKey()}`)
//     //   console.log(BALNCECREDITED.data ,"public hjmdfahjvkcwjvke")
//     let transaction;
//     const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
//     console.log(sourceAccount,"sourceacoounttttttttttttttttttttttttttttttttttt")
//     transaction = new DiamSdk.TransactionBuilder(sourceAccount, {
//       fee: DiamSdk.BASE_FEE,
//       networkPassphrase: DiamSdk.Networks.TESTNET,
//     })
//       .addOperation(
//         DiamSdk.Operation.payment({
//           destination: receiverAddress,
//           asset: DiamSdk.Asset.native(),
//           amount: "100",
//         })
//       )
//       // A memo allows you to add your own metadata to a transaction. It's
//       // optional and does not affect how Diamante treats the transaction.
//       .addMemo(DiamSdk.Memo.text("Transaction By SideBot"))
//       // Wait a maximum of three minutes for the transaction
//       .setTimeout(180)
//       .build();
//     // Sign the transaction to prove you are actually the person sending it.
    
//     transaction.sign(sourceKeys);
//     // And finally, send it off to Diamante!
//     console.log("Signing the transac",transaction);
//     return
//     const result = await server.submitTransaction(transaction);
//     console.log("Success! Results:", result);
// return
//     if (result.successful) {
//       const explorerUrl = "https://testnetexplorer.diamante.io/about-tx-hash/" + result.hash;

//       console.log("transcation HAsh",result.hash)
//     //   const transactionSuccessButton = [
//     //     [{ text: "🔍 See on Explorer", url: explorerUrl }],
//     //     ...homeOrWalletButton,
//     //   ];
//     //   ctx.api.editMessageText(
//     //     ctx.chat.id,
//     //     ctx.session.lastMessageId,
//     //     `Transfer of <b>${amount} ${ctx.session.tranferTokenName}</b> to <code>${receiverAddress}</code> was successfully completed`,
//     //     {
//     //       reply_markup: {
//     //         inline_keyboard: transactionSuccessButton,
//     //       },
//     //       parse_mode: "HTML",
//     //     }
//     //   );
//     }

//     console.log( "resu;lttttttttt",result)
//     return result;
//   } catch (error) {
//     console.log("error in transfer...", error);
//     return false;
//   }
// };



var sourceKeys = DiamSdk.Keypair.fromSecret(
  "SAYGMXWMXPVS4JQ2SAIR3EHSN6APKB76EVRYM2DI77Y2AJEYXV4P3RBS"
);
var destinationId = "GCDBPKKIPH2NCYTB6NAMWUSE44UMI3HGX6NYLICYQTXJSWERSKQKZA4O";
// Transaction will hold a built transaction we can resubmit if the result is unknown.
let transaction;

export const transfer = async () => {
    try {
        const sourceAccount = await server.loadAccount(sourceKeys.publicKey());
        transaction = new DiamSdk.TransactionBuilder(sourceAccount, {
            fee: DiamSdk.BASE_FEE,
            networkPassphrase: DiamSdk.Networks.TESTNET,
          })
            .addOperation(
              DiamSdk.Operation.payment({
                destination: destinationId,
                // Because Diamante allows transaction in many currencies, you must
                // specify the asset type. The special "native" asset represents Lumens.
                asset: DiamSdk.Asset.native(),
                amount: "100",
              })
            )
            // A memo allows you to add your own metadata to a transaction. It's
            // optional and does not affect how Diamante treats the transaction.
            .addMemo(DiamSdk.Memo.text("Test Transaction"))
            // Wait a maximum of three minutes for the transaction
            .setTimeout(180)
            .build();
          // Sign the transaction to prove you are actually the person sending it.
          transaction.sign(sourceKeys);
          // And finally, send it off to Diamante!
          const result = await server.submitTransaction(transaction);
          return result;
    } catch (error) {
        console.log("error in transfer...", error);
    }
}

async function main () {
    await transfer();
}

