const qrcode = require('qrcode');
const express = require('express');
const socketIo = require('socket.io');
const {body, validationResult} = require('express-validator');
const http = require('http');
const { Client, LocalAuth } = require('whatsapp-web.js');
const {numberFormatter} = require('./helpers/number_helper');
const {timeNowFormatted} = require('./helpers/get_fotmatted_time');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(__dirname+'/assets/'));
app.use(cors());
app.set(io)

app.get('/',(req,res) => {
    res.sendFile('index.html', {root: __dirname});
})

const client = new Client({
    puppeteer:{
        headless:true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
        ]
    },
    authStrategy: new LocalAuth({
        clientId: 'Adrian'
    })
});

client.initialize();
var webReady = 0;

// Socket Io
io.on('connection', function(socket){
    socket.emit('message', timeNowFormatted() + ' Connecting to WhatsApp services...');

    client.on('qr', (qr) => {
        qrcode.toDataURL(qr, (err,url)=>{
            socket.emit('qr',url);
            socket.emit('message', timeNowFormatted() + ' QR ready, please scan it ');
        });
    });

    client.on('authenticated', () => {
        socket.emit('message', timeNowFormatted() + ' QR Code scanned');
    });

    client.on('auth_failure', msg => {
        // Fired if session restore was unsuccessful
        console.error('AUTHENTICATION FAILURE', msg);
    });

    client.on('ready', () => {
        webReady = 1;
        socket.emit('message', timeNowFormatted() + ' WhatsApp is ready! ');
        let ready= '133187-ready-check.gif';
        socket.emit('ready', ready);
    });

    client.on('change_state', state => {
        console.log('CHANGE STATE', state);
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
    });

    client.on('loading_screen', (percent, message) => {
        socket.emit('message', timeNowFormatted() + ' WhatsApp initializing ' + percent + '%');
        // console.log('LOADING SCREEN', percent, message);
    });

    socket.on('check_status', () => {
        if (webReady === 0) {
            socket.emit('message', timeNowFormatted() + ' WhatsApp services not ready ');
        } else {
            socket.emit('message', timeNowFormatted() + ' WhatsApp services ready');
            let ready= '133187-ready-check.gif';
            socket.emit('ready', ready);
        }
    });
});

const checkRegisteredNumber = async function(number){
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
}

//Send message
app.post('/send-message',[body('number').notEmpty(), body('message').notEmpty()], async (req,res)=>{

    if (webReady != 0){
        const errors = validationResult(req).formatWith(({msg})=> {
            return msg;
        });

        if (!errors.isEmpty()){
            return res.status(422).json({
                status:false,
                message: errors.mapped()
            })
        }
        const number = numberFormatter(req.body.number);
        const message = req.body.message;
    
        const isRegisteredNumber = await checkRegisteredNumber(number);

        if (!isRegisteredNumber){
            return res.status(422).json({
                status:false,
                message:{message: 'Number is not registered on WhatsApp'}      
            })
        }

        client.sendMessage(number, message).then(response => { 
            console.log(response);
            io.emit('message', timeNowFormatted() + ' message sended to ' + number);
            res.status(200).json({
            status: true,
                response:response
            });
        })
        .catch(err=>{
            res.status(500).json({
                status:false,
                response:err
            })
        })
    } else {
        return res.status(404).json({
            status:false,
            message:{message: 'WhatsApp is offline, please contact Admin'}      
        });
    }
    
});

app.post('/restart', (req, res) => {
    res.send("Restarting server...");
    process.exit(0); // matikan process, nodemon/pm2 akan jalankan ulang
});


server.listen(8000, function(){
    console.log('App running on port '+8000)
});
