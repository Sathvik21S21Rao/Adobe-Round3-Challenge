from pymongo import MongoClient
import json
from datetime import datetime

# Connect to MongoDB
client = MongoClient('mongodb://localhost:27017/')
db = client['pdf-analysis']

# Create collections with indexes
def setup_database():
    # Users collection
    users = db['users']
    users.create_index('email', unique=True)
    
    # Folders collection
    folders = db['folders']
    folders.create_index([('userId', 1), ('name', 1)])
    
    # PDFs collection
    pdfs = db['pdfs']
    pdfs.create_index([('folderId', 1), ('userId', 1)])
    pdfs.create_index('filename', unique=True)
    
    # Headings collection
    headings = db['headings']
    headings.create_index('pdfId')
    headings.create_index([('pdfId', 1), ('page', 1)])
    
    print("Database setup completed successfully!")
    print("Collections created:")
    print("- users (with email index)")
    print("- folders (with userId + name index)")
    print("- pdfs (with folderId + userId index, unique filename)")
    print("- headings (with pdfId index)")

if __name__ == "__main__":
    setup_database()
