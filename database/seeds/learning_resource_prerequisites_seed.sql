-- ============================================================
-- SkillStat AI — Prerequisite data for mock learning resources
-- ============================================================
-- Additive/idempotent: plain UPDATEs against rows already inserted
-- by competency_seed.sql. Only a representative subset of resources
-- have a natural prerequisite; the rest are left NULL (no
-- prerequisite), which the recommendation engine treats as "none".
--
-- Run with (after 004_recommendation_engine.sql):
--   mysql -u root -p skillstat_ai < database/seeds/learning_resource_prerequisites_seed.sql
-- ============================================================

USE skillstat_ai;

UPDATE learning_resources SET prerequisites = 'Introduction to Statistical Methods'
  WHERE title = 'Applied Statistical Analysis';

UPDATE learning_resources SET prerequisites = 'Applied Statistical Analysis'
  WHERE title = 'Advanced Inferential Techniques';

UPDATE learning_resources SET prerequisites = 'Getting Started with Statistical Computing'
  WHERE title = 'Statistical Computing with R';

UPDATE learning_resources SET prerequisites = 'Exploratory Data Analysis Basics'
  WHERE title = 'Applied Data Analysis for Officers';

UPDATE learning_resources SET prerequisites = 'Applied Data Analysis for Officers'
  WHERE title = 'Advanced Data Analysis Techniques';

UPDATE learning_resources SET prerequisites = 'Machine Learning Foundations'
  WHERE title = 'Applied ML for Official Data';

UPDATE learning_resources SET prerequisites = 'Python for Beginners'
  WHERE title = 'Python for Data Handling';

UPDATE learning_resources SET prerequisites = 'SQL Fundamentals'
  WHERE title = 'Database Design for Statistical Systems';

UPDATE learning_resources SET prerequisites = 'Data Visualization Essentials'
  WHERE title = 'Dashboards for Decision Makers';

UPDATE learning_resources SET prerequisites = 'Fundamentals of Data Quality'
  WHERE title = 'Data Validation and Cleaning';
