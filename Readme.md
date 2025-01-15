User Events API

This API allows you to manage user details and events, providing endpoints to save user data and event information.


## API Reference

#### 1. User Registration


```http
  POST /user/registerUser
```
Description: Registers a new user by generating a unique ID, private key, and wallet.
#### Middleware: validateRequest(validators.user.registerUser)

| Parameter | Type     | Required field                |
| :-------- | :------- | :------------------------- |
| `body` | `string` | {"appId": "string", "deviceId": "string"}|

#### 2. Game Registration

```http
  POST /user/registerGame
```
Description: Registers a new game under a user.

| Parameter | Type     | Required field                       |
| :-------- | :------- | :-------------------------------- |
| `body`     | `string` | {"name": "string","type": "string","description": "string" , events :array}|

#### 3. Send Event

```http
  POST /sendEvent
```
Description: Sends event data to the associated smart account.

| Parameter | Type     | Required field                       |
| :-------- | :------- | :-------------------------------- |
| `query`     | `string` | eventId|
| `query`     | `string` | gameId|

#### 3. All transactions

```http
  POST /transaction
```
Description: Get all Transactions.

| Parameter | Type     | Required field                       |
| :-------- | :------- | :-------------------------------- |
| -     | - | -|


Controller Logic:

Generates a unique eventId (e.g., eventXYZ).
Accepts event data (name, type, eventDetails, etc.).
Calls the dbservices.User.eventDetails to save the event in the database.
Database Operation:

Inserts the eventId, userId, name, type, and eventDetails into the eventData table.


- Notes
  1. Ensure you pass the Authorization header for the /saveevents route.
  2. For local development, configure the database connection in the .env file.
  3. if you want to run user route http://localhost:port/user/endPoints
  4. if you want to run auth route http://localhost:port/auth/endPoints
  5. After 200 miniuts token will be expire.



## Process How To Run The Project.....

## clone the Project
    - git clone "coppied http url"
    - cd foldername
    - code .


## Step 1 - Create .env file outside the src

## step 2 - copy given .env.example file paste into the .env and assign all the values according to your DB Credentials.

## step 3 -  If you are Passing db url in the .env in place of local DB credentials you need to do some changes in the following files...
   1. src/config/db.ts - just comment the Client variable (from line 6 to 12) and un-comment the line number 13 ( "export const client = new Client(envConfigs.databaseUrl)" ) 

   2. src/config/envconfig.ts - 
      i. just comment the line from 12 to 7 and un-comment the line 13 present in the envVarsSchema variable.......
      ii. just comment the whole db object in present inside the "envConfigs" variable (line. 42 to 49 )
   3. /drizzle.config.ts - comment the code from line 9 to 14 and un-comment the line 15

## step 4 - run command "npm i" (to install all the packages)

## step 5 - If you are passing local DB credentials then run two commands 
          1. npm run migration:generate
          2. npm run migration:push   

## step 6 - run command "npm run dev"

## step 7 - After the step 6. In the terminal you can see "server is running" and "DB connected"

## step 8 - To check your DB Table You can run "npx drizzle-kit studio"

## step 9 - Done............       







