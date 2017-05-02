Thanks to Sergii Kalinchuk!

TODO:

1. why isn't Beeminder POSTing to workerbee.glitch.me/autofetch when the user hits the goal refresh button at bmndr.com/d/euler? - 
**Sergii:** *it looks like despite receiving normal status, callback_url in the goal is not updated. You may try creating a new connection and see in the logs the response from Beeminder API. I always get callback_url: false*
