# This solution sets up a monitoring system on AWS for checking the uptime of a specific URL. The system works in the following way: 

# An AWS Lambda function is created, which sends a GET request to the URL you want to monitor. This function is scheduled to be invoked periodically (like every 5 minutes) by a CloudWatch Events rule. If the URL is down (the HTTP status code of the response is not 200), the Lambda function publishes a message to an SNS Topic. The message contains the status code of the failed GET request and indicates that the URL is down.

# An Amazon SNS (Simple Notification Service) Topic is used to send this message to all its subscribers. In this case, the subscriber is an email address. When the SNS topic receives the message from the Lambda function, it immediately sends an email to the subscribed email address. The email contains the message published to the SNS topic, indicating that the monitored URL is down.

# In this way, this solution constantly monitors the URL and immediately alerts you via email if the URL goes down. This allows you to quickly react to downtime and take necessary actions to restore service.

# These instructions are designed to used AWS CloudShell, but you can also use this in their own terminal using the AWS CLI 

# optional testing steps: deploy the cloudformation template which gives you a simple website - edit the hosted zoneid to reflect your own DNS name (if you do not have a hosted zone, you can use the EC2 instances IP address)

- create an s3 bucket in which to upload the website files to 

aws s3 mb s3://downtimetester

- be sure to edit the user data in the CloudFormation template to reflect your chosen bucket name 

- upload the files to the bucket

aws s3 cp index.html s3://$BUCKETNAME

aws s3 cp website.css s3://YOUR_BUCKET_NAME

- deploy the AWS CloudFormation template 

aws cloudformation create-stack --stack-name ec2-test --template-body file://web-app-test.yaml --capabilities CAPABILITY_IAM

- you can check the progress of your template by running this command 

aws cloudformation describe-stacks --stack-name ec2-test 

# 1. Set up an Amazon SNS Topic 

- create your Amazon SNS Topic

TOPICARN=$(aws sns create-topic --name DowntimeDetectorSNSTopic --query TopicArn --output text)

- subscribe to your SNS Topic

aws sns subscribe --topic-arn $TOPICARN --protocol email --notification-endpoint your_email@gmail.com

# 2. Create your Lambda Function

# 2.1 Create our IAM Policy

- install nano

sudo yum install nano -y

- create our IAM policy

nano DowntimeLambdaPolicy.json

- paste in the content from the DowntimeLambdaPolicy - being sure to change the ARN from the resource section in the policy

- attach our policy document to our policy in AWS

POLICYARN=$(aws iam create-policy --policy-name DowntimeDetectorPolicy --policy-document file://DowntimeLambdaPolicy.json --query Policy.Arn --output text)

# 2.2 Create our IAM Role

- create our assume role policy document

nano assumerolepolicy.json

- paste the code from the assumerolepolicy.json file in the download in the new file in Cloudshell and create our policy

- create our Downtime role

ROLEARN=$(aws iam create-role --role-name DowntimeLambdaRole --assume-role-policy-document file://assumerolepolicy.json --query Role.Arn --output text)

- attach your IAM policy to your IAM role

aws iam attach-role-policy --policy-arn $POLICYARN --role-name DowntimeLambdaRole

# 2.3 Create our Lambda Function 

- create a JS file in by using nano and by pasting the code from the downtime.js file, whilst making sure you edit the various commented sections, i.e. DNS name or IP address and the SNS topic ARN

nano index.js

- create our function

- zip up your code

zip index.zip index.js

- create your lambda function

FUNCTIONARN=$(aws lambda create-function --function-name DowntimeMonitor --zip-file fileb://index.zip --handler index.handler --runtime nodejs14.x --role $ROLEARN --environment Variables={AWS_NODEJS_CONNECTION_REUSE_ENABLED=1} --output text --query 'FunctionArn')

- invoke our function and check it is working

aws lambda invoke --function-name DowntimeMonitor --payload '{}' outputfile.txt && cat outputfile.txt

- you should see ''{"statusCode":200,"body":"\"URL checked successfully!\""}


# 3. Set up a CloudWatch Events rule to trigger your Lambda Function

- create your EventBridge rule

RULEARN=$(aws events put-rule --name "DowntimeMonitorRule" --schedule-expression "rate(1 minute)" --output text --query RuleArn)

- give eventbride permission to trigger Lambda 

aws lambda add-permission --function-name DowntimeMonitor --statement-id "DowntimeMonitorRule" --action 'lambda:InvokeFunction' --principal events.amazonaws.com --source-arn $RULEARN

- associate lambda with our rule

aws events put-targets --rule "DowntimeMonitorRule" --targets "Id"="1","Arn"="$FUNCTIONARN"

- test our downtime monitor by deleting the cloudformation stack which we deployed earlier

aws cloudformation delete-stack --stack-name ec2-test

- delete the rest of your resources

aws lambda delete-function --function-name DowntimeMonitor

aws sns delete-topic --topic-arn $TOPICARN

aws iam detach-role-policy --role-name DowntimeLambdaRole --policy-arn $POLICYARN

aws iam delete-role --role-name DowntimeLambdaRole

aws iam delete-policy --policy-arn $POLICYARN

aws s3 rm s3://BUCKET_NAME --recursive

aws s3api delete-bucket --bucket BUCKET_NAME


