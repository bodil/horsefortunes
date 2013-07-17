///<reference path="node.d.ts" />
///<reference path="async.d.ts" />
///<reference path="node_redis.d.ts" />
///<reference path="mtwitter.d.ts" />
///<reference path="underscore.d.ts" />
///<reference path="express.d.ts" />

import redis = require("redis");
import mtwitter = require("mtwitter");
import _ = require("underscore");
import async = require("async");
import express = require("express");
import parseRedisUrl = require("parse-redis-url")

interface Tweet {
  id: number;
  text: string;
}

interface FetchOpts {
  since_id?: number;
  max_id?: number;
  count?: number;
}

if (!process.env.CONSUMER_KEY) {
  console.error("Environment variables CONSUMER_KEY, CONSUMER_SECRET,");
  console.error("ACCESS_TOKEN_KEY and ACCESS_TOKEN_SECRET are undefined.");
  process.exit(1);
}

var twitter = new mtwitter({
  consumer_key: process.env.CONSUMER_KEY,
  consumer_secret: process.env.CONSUMER_SECRET,
  access_token_key: process.env.ACCESS_TOKEN_KEY,
  access_token_secret: process.env.ACCESS_TOKEN_SECRET
});

var redisUrl = process.env.REDISTOGO_URL;
parseRedisUrl(redis).createClient(redisUrl, (err, client) => {
  if (err) { console.error(err); process.exit(1); }
  client.on("error", (err) => console.error("Redis:", err));

  function addTweet(tweet: Tweet, cb: (err) => void): void {
    client.zscore("horse:id", tweet.id, (err, res) => {
      if (err) {
        cb(err);
        return;
      }
      if (res) {
        cb(null);
        return;
      }
      console.log("Adding tweet", tweet.id, tweet.text);
      client.multi()
          .zadd("horse:id", tweet.id, tweet.id)
          .rpush("horse:text", tweet.text)
          .exec((err, res) => cb(err));
    });
  }

  function newestTweet(cb: (err, res: number) => void): void {
    client.zrange("horse:id", -1, -1, (err, res) => {
      if (err) cb(err, null);
      else {
        if (res) cb(null, parseInt(res[0], 10));
        else cb(null, null);
      }
    });
  }

  function oldestTweet(cb: (err, res: number) => void): void {
    client.zrange("horse:id", 0, 0, (err, res) => {
      if (err) cb(err, null);
      else {
        if (res) cb(null, parseInt(res[0], 10));
        else cb(null, null);
      }
    });
  }

  function tweetCount(cb: (err, res: number) => void): void {
    client.zcard("horse:id", (err, res) => {
      if (err) cb(err, null);
      else cb(null, res);
    });
  }

  function fetchTweets(opts: FetchOpts, cb: (err, res: Tweet[]) => void): void {
    twitter.get("statuses/user_timeline", _.extend({
      screen_name: "horse_ebooks",
      trim_user: true,
      exclude_replies: true,
      include_rts: false
    }, opts), (err, feed) => {
      if (err) cb(err, null);
      else cb(null, feed);
    });
  }

  function fillTo(total: number, cb: (err) => void): void {
    tweetCount((err, res) => {
      if (err) { cb(err); return; }
      console.log("Contains " + res + " tweets.");
      if (res < total) {
        oldestTweet((err, res) => {
          if (err) cb(err);
          else {
            var opts: FetchOpts = { count: 200 };
            if (res) opts.max_id = res - 1;
            fetchTweets(opts, (err, res) => {
              if (err) cb(err);
              else {
                async.each(res, addTweet, (err) => {
                  fillTo(total, cb);
                });
              }
            });
          }
        });
      } else {
        cb(null);
      }
    });
  }

  function fetchNew(cb: (err) => void): void {
    newestTweet((err, res) => {
      if (err) { cb(err); return; }
      fetchTweets({ since_id: res }, (err, res) => {
        if (err) { cb(err); return; }
        async.each(res, addTweet, cb);
      });
    });
  }

  function randomTweet(cb: (err, res) => void): void {
    client.llen("horse:text", (err, len) => {
      if (err) { cb(err, null); return; }
      var index = Math.floor(Math.random() * len);
      client.lindex("horse:text", index, cb);
    });
  }

  function allTweets(cb: (err, res) => void): void {
    client.lrange("horse:text", 0, -1, cb);
  }

  fillTo(3000, (err) => {
    if (err) console.error(err);
    setInterval(() => {
      fetchNew((err) => {
        if (err) console.error(err);
      });
    }, 10 * 60 * 1000);
  });

  function getSingle(req: ExpressServerRequest, res: ExpressServerResponse): void {
    randomTweet((err, tweet) => {
      res.send(tweet + "\n");
    });
  }

  function getFortuneFile(req: ExpressServerRequest, res: ExpressServerResponse): void {
    allTweets((err, tweets) => {
      res.send(tweets.map((i) => (i + "\n%\n")).join(""));
    });
  }

  var app = express()
      .use(express.logger())
      .get("/", getSingle)
      .get("/fortune", getFortuneFile);

  var port = process.env.PORT || 1337;
  app.listen(port, () => {
    console.log("Listening on http://localhost:" + port + "/");
  });

});
