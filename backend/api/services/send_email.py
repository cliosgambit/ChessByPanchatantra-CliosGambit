import smtplib
import sys
import os # Import the os module

def send_email(to_email, otp, from_email, from_password):
    try:
        # Create an SMTP session
        s = smtplib.SMTP('smtp.gmail.com', 587)
        s.starttls()  # Start TLS for security

        # Login to your email account
        s.login(from_email, from_password)

        # Prepare the message
        message = f"""From: Clio's Gambit <{from_email}>
To: {to_email}
Subject: Your One-Time Password (OTP)

Your OTP for Clio's Gambit is: {otp}

This code will expire in 10 minutes.
"""

        # Send the email
        s.sendmail(from_email, to_email, message)
        print("Email sent successfully.")

    except smtplib.SMTPAuthenticationError:
        print("Authentication error: Check your email and app password.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An error occurred: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        s.quit()  # Close the SMTP session

# Accept command line arguments
if __name__ == "__main__":
    to_email = sys.argv[1]
    otp = sys.argv[2]
    # Get credentials from environment variables for security
    from_email = os.getenv('GMAIL_USER')
    from_password = os.getenv('GMAIL_APP_PASS')
    
    if not from_email or not from_password:
        print("Email credentials are not set in environment variables.", file=sys.stderr)
        sys.exit(1)
        
    send_email(to_email, otp, from_email, from_password)