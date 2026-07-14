import sys
import os

# Add the project directory to the sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Import the FastAPI application
from api import app

# Import a2wsgi to bridge ASGI (FastAPI) to WSGI (Passenger)
from a2wsgi import ASGIMiddleware

# Passenger expects an object named 'application'
application = ASGIMiddleware(app)
