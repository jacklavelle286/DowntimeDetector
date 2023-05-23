const http = require('http');
const AWS = require('aws-sdk');

let lastStatus = null;

exports.handler = async (event) => {
    const url = 'http://YOUR_URL_OR_IP'; 
    const snsTopicArn = 'YOUR_SNS_ARN';

    return new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
            if (res.statusCode === 200) {
                lastStatus = 'up';
                resolve({
                    statusCode: 200,
                    body: JSON.stringify('URL checked successfully!'),
                });
            } else if (lastStatus !== 'down') {
                lastStatus = 'down';
                const sns = new AWS.SNS();
                const params = {
                    Message: `The URL ${url} is down. Status code: ${res.statusCode}`,
                    TopicArn: snsTopicArn,
                };
                sns.publish(params, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({
                            statusCode: 200,
                            body: JSON.stringify('URL checked successfully!'),
                        });
                    }
                });
            }
        });

        req.setTimeout(2000, () => {
            req.abort();
            if (lastStatus !== 'down') {
                lastStatus = 'down';
                const sns = new AWS.SNS();
                const params = {
                    Message: `The URL ${url} did not respond within the expected time. It might be down.`,
                    TopicArn: snsTopicArn,
                };
                sns.publish(params, (snsErr, data) => {
                    if (snsErr) {
                        reject(snsErr);
                    } else {
                        resolve({
                            statusCode: 200,
                            body: JSON.stringify('The URL did not respond within the expected time. It might be down.'),
                        });
                    }
                });
            }
        });
    });
};
