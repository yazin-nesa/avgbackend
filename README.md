# Vehicle Service Management System API

This is the backend API for the Vehicle Service Management System. It provides endpoints for managing vehicles, services, staff, complaints, and more.

## Features

- User authentication and authorization
- Staff management
- Branch management
- Vehicle management
- Service management
- Complaint management
- System settings
- Error handling
- Input validation
- MongoDB integration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

## Installation

1. Clone the repository
2. Navigate to the backend directory:
   ```bash
   cd backendV1
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/avg_motors
   JWT_SECRET=your_jwt_secret_key_here
   JWT_EXPIRE=30d
   JWT_COOKIE_EXPIRE=30
   NODE_ENV=development
   ```

## Running the Server

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## API Documentation

### Authentication Routes

#### Register User
- **POST** `/api/v1/auth/register`
- Creates a new user account
- Requires: firstName, lastName, email, password, role, branch

#### Login
- **POST** `/api/v1/auth/login`
- Authenticates a user
- Requires: email, password

#### Get Current User
- **GET** `/api/v1/auth/me`
- Returns the currently logged-in user's details
- Requires: Authentication

### User Routes

#### Get All Users
- **GET** `/api/v1/users`
- Returns a list of all users
- Supports: pagination, search, filtering
- Requires: Authentication, Admin/HR role

#### Get Single User
- **GET** `/api/v1/users/:id`
- Returns details of a specific user
- Requires: Authentication, Admin/HR role

### Branch Routes

#### Get All Branches
- **GET** `/api/v1/branches`
- Returns a list of all branches
- Supports: pagination, search, filtering
- Requires: Authentication

#### Get Branch Statistics
- **GET** `/api/v1/branches/:id/stats`
- Returns statistics for a specific branch
- Requires: Authentication

### Vehicle Routes

#### Get All Vehicles
- **GET** `/api/v1/vehicles`
- Returns a list of all vehicles
- Supports: pagination, search, filtering
- Requires: Authentication

#### Get Vehicle Service History
- **GET** `/api/v1/vehicles/:id/services`
- Returns service history for a specific vehicle
- Requires: Authentication

### Service Routes

#### Get All Services
- **GET** `/api/v1/services`
- Returns a list of all services
- Supports: pagination, search, filtering
- Requires: Authentication

#### Create Service
- **POST** `/api/v1/services`
- Creates a new service record
- Requires: Authentication

### Complaint Routes

#### Get All Complaints
- **GET** `/api/v1/complaints`
- Returns a list of all complaints
- Supports: pagination, search, filtering
- Requires: Authentication

#### Escalate Complaint
- **PUT** `/api/v1/complaints/:id/escalate`
- Escalates a complaint
- Requires: Authentication

### Settings Routes

#### Get Settings
- **GET** `/api/v1/settings`
- Returns system settings
- Requires: Authentication

#### Update Settings
- **PUT** `/api/v1/settings`
- Updates system settings
- Requires: Authentication, Admin role

## Error Handling

The API uses a centralized error handling mechanism. All errors are formatted consistently:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Models

### User
- firstName
- lastName
- email
- password
- role
- branch
- status
- lastLogin

### Branch
- name
- address
- phone
- email
- manager
- operatingHours
- status
- capacity

### Vehicle
- registrationNumber
- make
- model
- year
- owner
- type
- status
- branch
- serviceHistory

### Service
- vehicle
- serviceType
- description
- startDate
- completionDate
- technicians
- status
- parts
- laborHours
- totalCost

### Complaint
- title
- description
- category
- priority
- status
- vehicle
- service
- branch
- timeline
- resolution

### Settings
- company
- notifications
- service
- security
- maintenance
- analytics

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License. 