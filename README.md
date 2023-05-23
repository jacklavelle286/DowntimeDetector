# DowntimeDetector
Downtime detector for URLs and IP addresses using AWS Services. 

This solution sets up a monitoring system on AWS for checking the uptime of a specific URL. The system works in the following way: 

1. An AWS Lambda function is created, which sends a GET request to the URL you want to monitor. This function is scheduled to be invoked periodically (like every 5 minutes) by a CloudWatch Events rule. If the URL is down (the HTTP status code of the response is not 200), the Lambda function publishes a message to an SNS Topic. The message contains the status code of the failed GET request and indicates that the URL is down.
2. An Amazon SNS (Simple Notification Service) Topic is used to send this message to all its subscribers. In this case, the subscriber is an email address. When the SNS topic receives the message from the Lambda function, it immediately sends an email to the subscribed email address. The email contains the message published to the SNS topic, indicating that the monitored URL is down.

In this way, this solution constantly monitors the URL and immediately alerts you via email if the URL goes down. This allows you to quickly react to downtime and take necessary actions to restore service.

These instructions are written explicity for use in AWS CloudShell, but you can also use this in their own terminal using the AWS CLI - and all of the files you will need are in this Repo.

## Optional testing steps: 
Deploy the cloudformation template which gives you a simple website - edit the hosted zoneid to reflect your own DNS name (if you do not have a hosted zone, you can use the EC2 instances IP address)

1. Create an s3 bucket in which to upload the website files to 

    ```bash
    aws s3 mb s3://YOUR_BUCKET_NAME
    ```
   
2. Be sure to edit the user data in the CloudFormation template to reflect your chosen bucket name 
   
3. Upload the files to the bucket

    ```bash
    aws s3 cp index.html s3://YOUR_BUCKET_NAME
    aws s3 cp website.css s3://YOUR_BUCKET_NAME
    ```
   
4. Deploy the AWS CloudFormation template 

    ```bash
    aws cloudformation create-stack --stack-name ec2-test --template-body file://web-app-test.yaml --capabilities CAPABILITY_IAM
    ```
   
5. You can check the progress of your template by running this command 

    ```bash
    aws cloudformation describe-stacks --stack-name ec2-test 
    ```

## 1. Set up an Amazon SNS Topic 

1. Create your Amazon SNS Topic

    ```bash
    TOPICARN=$(aws sns create-topic --name DowntimeDetectorSNSTopic --query TopicArn --output text)
    ```
   
2. Subscribe to your SNS Topic

    ```bash
    aws sns subscribe --topic-arn $TOPICARN --protocol email --notification-endpoint your_email@gmail.com
    ```

## 2. Create your Lambda Function

### 2.1 Create our IAM Policy

1. Install nano

    ```bash
    sudo yum install nano -y
    ```
   
2. Create our IAM policy

    ```bash
    nano DowntimeLambdaPolicy.json
    ```
   
3. Paste in the content from the DowntimeLambdaPolicy - being sure to change the ARN from the resource section in the policy

4. Attach our policy document to our policy in AWS

    ```bash
    POLICYARN=$(aws iam create-policy --policy-name DowntimeDetectorPolicy --policy-document file://DowntimeLambdaPolicy.json --query Policy.Arn --output text)
    ```

### 2.2 Create our IAM Role

1. Create our assume role policy document

    ```bash
    nano assumerolepolicy.json
    ```
   
2. Paste the code from the assumerolepolicy.json file in the download in the new file in Cloudshell and create our policy

3. Create our Downtime role

    ```bash
    ROLEARN=$(aws iam create-role --role-name DowntimeLambdaRole --assume-role-policy-document file://assumerolepolicy.json --query Role.Arn --output text)
    ```
   
4. Attach your IAM policy to your IAM role

    ```bash
    aws iam attach-role-policy --policy-arn $POLICYARN --role-name DowntimeLambdaRole
    ```

### 2.3 Create our Lambda Function 

1. Create a JS file in by using nano and by pasting the code from the downtime.js file, whilst making sure you edit the various commented sections, i.e. DNS name or IP address and the SNS topic ARN

    ```bash
    nano index.js
    ```
   
2. Zip up your code

    ```bash
    zip index.zip index.js
    ```
   
3. Create your lambda function

    ```bash
    FUNCTIONARN=$(aws lambda create-function --function-name DowntimeMonitor --zip-file fileb://index.zip --handler index.handler --runtime nodejs14.x --role $ROLEARN --environment Variables={AWS_NODEJS_CONNECTION_REUSE_ENABLED=1} --output text --query 'FunctionArn')
    ```
   
4. Invoke our function and check it is working

    ```bash
    aws lambda invoke --function-name DowntimeMonitor --payload '{}' outputfile.txt && cat outputfile.txt
    ```
   
5. You should see ''{"statusCode":200,"body":"\"URL checked successfully!\""}

## 3. Set up a CloudWatch Events rule to trigger your Lambda Function

1. Create your EventBridge rule

    ```bash
    RULEARN=$(aws events put-rule --name "DowntimeMonitorRule" --schedule-expression "rate(1 minute)" --output text --query RuleArn)
    ```
   
2. Give eventbride permission to trigger Lambda 

    ```bash
    aws lambda add-permission --function-name DowntimeMonitor --statement-id "DowntimeMonitorRule" --action 'lambda:InvokeFunction' --principal events.amazonaws.com --source-arn $RULEARN
    ```
   
3. Associate lambda with our rule

    ```bash
    aws events put-targets --rule "DowntimeMonitorRule" --targets "Id"="1","Arn"="$FUNCTIONARN"
    ```
   
4. Test our downtime monitor by deleting the cloudformation stack which we deployed earlier

    ```bash
    aws cloudformation delete-stack --stack-name ec2-test
    ```
   
5. Delete the rest of your resources

    ```bash
    aws lambda delete-function --function-name DowntimeMonitor
    aws sns delete-topic --topic-arn $TOPICARN
    aws iam detach-role-policy --role-name DowntimeLambdaRole --policy-arn $POLICYARN
    aws iam delete-role --role-name DowntimeLambdaRole
    ```


## Cost Estimation

The main services utilized in the Downtime Detector solution include AWS Lambda, Amazon SNS, and Amazon CloudWatch. Pricing can vary by region and over time, but as of my knowledge cutoff in September 2021, here are the relevant details:

### AWS Lambda 

AWS Lambda is billed on the number of requests and the time your code executes. AWS Lambda offers 1 million free requests per month and up to 3.2 million seconds of compute time per month, depending on the amount of memory allocated to your function. If your function is invoked every 5 minutes, that's about 8,640 invocations in a 30-day month. If each execution takes less than a second and uses less than 128 MB of memory, you would remain within the free tier.

### Amazon SNS 

Amazon SNS offers the first 1 million Amazon SNS requests for free. After the free tier, it is $0.50 per million SNS requests. You would only exceed the free tier if your URL goes down more than 1 million times per month.

### Amazon CloudWatch 

Amazon CloudWatch is used to trigger your Lambda function. There is a cost associated with CloudWatch Events/EventBridge, but the first 1,000,000 events are free, then $1.00 per million events thereafter. If you're triggering your function every 5 minutes, you would use about 8,640 events per month, which is well within the free tier.

For moderate usage, the solution should largely fall within the AWS Free Tier. If your usage exceeds the quantities provided in the free tier, or if you have already exhausted your free tier limits, you would then start to incur costs.

Also remember that costs can be higher if you're using this system to monitor multiple URLs, as that would increase the number of Lambda function invocations, SNS messages, and CloudWatch Events.

Please consult the AWS Pricing page for up-to-date information and to use the AWS Pricing Calculator for a more accurate cost estimate based on your specific use case.

These estimates do not include optional test resources like EC2 instances, S3 storage costs, or data transfer costs. Always review the full pricing details on the AWS official website for all services used to understand all possible charges.

