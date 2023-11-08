const cors = require("cors");
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// cors middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyJwt = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    res.status(401).json({ success: false, message: "Unauthorized access" });
  }
  jwt.verify(token, process.env.JWT_ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      res.status(403).json({ success: false, message: "Forbidden access" });
    }
    req.user = decoded.email;
    next();
  });
};

// api validation
function validateJob(jobData) {
  if (
    jobData &&
    jobData.title &&
    jobData.type &&
    jobData.deadline &&
    jobData.min_salary !== undefined &&
    jobData.max_salary !== undefined &&
    jobData.company &&
    jobData.company.name &&
    jobData.created_by &&
    jobData.created_by.name &&
    jobData.created_by.email
  ) {
    return true;
  } else {
    return false;
  }
}

const uri = process.env.DATABASE_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const Job = client.db("job-portal-db").collection("job");

async function run() {
  try {
    // token generate
    app.post("/jwt", async (req, res) => {
      const data = req.body;
      const token = jwt.sign(data, process.env.JWT_ACCESS_TOKEN, {
        expiresIn: "1d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
        })
        .send({ success: true });
    });

    app.post("/logout", async (req, res) => {
      const email = req.body;
      console.log("logging out", email);
      res.clearCookie("token", { maxAge: 0 }).send({ success: true });
    });

    // jobt post api
    app.post("/job", async (req, res) => {
      const jobData = req.body;
      const isValidJob = validateJob(jobData);

      // validation

      if (isValidJob) {
        const formatDeadline = new Date(jobData.deadline).toISOString();
        jobData.deadline = formatDeadline;

        jobData.candidates = [];
        jobData.applicants = 0;

        const currentDate = new Date().toISOString();
        jobData.createdAt = currentDate;

        const result = await Job.insertOne(jobData);
        res.status(201).json({
          success: true,
          message: "Job added successful",
          result,
        });
      } else {
        res.status(400).json({ success: false, message: "Invalid job data" });
      }
    });

    // get jobs api
    app.get("/job", async (req, res) => {
      const queryObj = { ...req.query };
      const excludeQueries = ["page", "sort", "limit", "fields", "search"];
      excludeQueries.forEach((el) => delete queryObj[el]);

      const queryString = JSON.stringify(queryObj);

      let filter = JSON.parse(queryString);

      if (req.query.search) {
        filter.title = { $regex: req.query.search, $options: "i" };
      }

      const projection = {
        banner: 0,
        description: 0,
        company: 0,
      };

      const result = await Job.find(filter).project(projection).toArray();

      res.status(200).json({
        success: true,
        message: "Jobs retrieved successful",
        count: result.length,
        result,
      });
    });

    // get a job api
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const result = await Job.findOne({ _id: new ObjectId(id) });
      res.status(200).json({
        success: true,
        message: "Job retrieved successful",
        result,
      });
    });

    // update a job
    app.patch("/job/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      const filter = { _id: new ObjectId(id) };
      const update = { $set: updateData };

      const result = await Job.updateOne(filter, update);
      res.status(200).json({
        success: true,
        message: "Job update successful",
        result,
      });
    });

    // delete a job api
    app.delete("/job/:id", async (req, res) => {
      const id = req.params.id;

      const filter = { _id: new ObjectId(id) };

      const result = await Job.deleteOne(filter);
      res.status(200).json({
        success: true,
        message: "Job delete successful",
        result,
      });
    });

    // get my jobs api
    app.get("/me/job", verifyJwt, async (req, res) => {
      const email = req.query.email;
      const requestedEmail = req.user;
      if (requestedEmail === email) {
        const filter = { "created_by.email": email };
        const result = await Job.find(filter).toArray();
        res.status(200).json({
          success: true,
          message: "Jobs retrieved successful",
          count: result.length,
          result,
        });
      } else {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden access" });
      }
    });

    // update my job api
    app.patch("/me/job/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const email = req.query.email;
      const requestedEmail = req.user;
      if (requestedEmail === email) {
        const filter = { _id: new ObjectId(id) };
        const update = { $set: updatedData };

        const result = await Job.updateOne(filter, update);
        res.status(200).json({
          success: true,
          message: "Jobs update successful",
          count: result.length,
          result,
        });
      } else {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden access" });
      }
    });

    // delete my job api
    app.delete("/me/job/:id", verifyJwt, async (req, res) => {
      const id = req.params.id;
      const email = req.query.email;
      const requestedEmail = req.user;
      if (requestedEmail === email) {
        const filter = { _id: new ObjectId(id) };

        const result = await Job.deleteOne(filter);
        res.status(200).json({
          success: true,
          message: "Job delete successful",
          result,
        });
      } else {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden access" });
      }
    });

    // apply a job api
    app.patch("/applied-job/:id", verifyJwt, async (req, res) => {
      const email = req.body.email;
      const requestedEmail = req.user;
      const id = req.params.id;
      const updateData = req.body;

      const job = await Job.findOne({ _id: new ObjectId(id) });

      const isAlreadyApplied = job.candidates.some(
        (candidate) => candidate.email === requestedEmail
      );

      if (isAlreadyApplied) {
        return res.status(409).json({
          success: false,
          message: "You have already applied to this job",
        });
      }

      if (email === requestedEmail) {
        const filter = { _id: new ObjectId(id) };
        const update = {
          $inc: { applicants: 1 },
          $push: {
            candidates: {
              name: updateData.name,
              email: updateData.email,
            },
          },
        };

        const result = await Job.updateOne(filter, update);
        res.status(200).json({
          success: true,
          message: "Job update successful",
          result,
        });
      } else {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden access" });
      }
    });

    // get my applied jobs
    app.get("/applied-job/", verifyJwt, async (req, res) => {
      const email = req.query.email;
      const requestedEmail = req.user;

      if (email === requestedEmail) {
        const projection = {
          candidates: 0,
        };

        const result = await Job.find({
          "candidates.email": email,
        })
          .project(projection)
          .toArray();

        res.status(200).json({
          success: true,
          message: "Jobs applied retrieved successful",
          count: result.length,
          result,
        });
      } else {
        return res
          .status(403)
          .json({ success: false, message: "Forbidden access" });
      }
    });

    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Database connection established!");
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Job portal server listening on port ${port}`);
});
