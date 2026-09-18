-- Gap SQLite schema. Applied idempotently at startup.
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT CHECK(role IN ('teacher','student')),password TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS classes(id TEXT PRIMARY KEY,teacher_id TEXT REFERENCES users(id),name TEXT NOT NULL,syllabus TEXT NOT NULL,material_version INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS memberships(class_id TEXT REFERENCES classes(id),student_id TEXT REFERENCES users(id),PRIMARY KEY(class_id,student_id));
 CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),title TEXT,questions TEXT,status TEXT,engine TEXT,created_at TEXT);
 CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,quiz_id TEXT REFERENCES quizzes(id),student_id TEXT REFERENCES users(id),answers TEXT,results TEXT,score REAL,total REAL,confidence REAL,status TEXT,reason TEXT,created_at TEXT,UNIQUE(quiz_id,student_id));
 CREATE TABLE IF NOT EXISTS gaps(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),student_id TEXT REFERENCES users(id),topic TEXT,tag TEXT,section TEXT,status TEXT,severity INTEGER,source TEXT,intervention_id TEXT,updated_at TEXT,UNIQUE(class_id,student_id,tag));
 CREATE TABLE IF NOT EXISTS interventions(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),topic TEXT,tag TEXT,content TEXT,probe TEXT,targets TEXT,status TEXT,engine TEXT,created_at TEXT,approved_at TEXT);
 CREATE TABLE IF NOT EXISTS probes(id TEXT PRIMARY KEY,gap_id TEXT REFERENCES gaps(id),student_id TEXT REFERENCES users(id),answer TEXT,correct INTEGER,created_at TEXT);
 CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),student_id TEXT REFERENCES users(id),text TEXT,created_at TEXT);
 CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),agent TEXT,action TEXT,details TEXT,student_id TEXT,job_id TEXT,created_at TEXT);
 CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,class_id TEXT REFERENCES classes(id),actor_id TEXT REFERENCES users(id),kind TEXT,payload TEXT,status TEXT,result TEXT,error TEXT,created_at TEXT,updated_at TEXT);
 CREATE INDEX IF NOT EXISTS gap_class ON gaps(class_id,status);
 CREATE INDEX IF NOT EXISTS submission_student ON submissions(student_id);
 CREATE INDEX IF NOT EXISTS event_class ON events(class_id,created_at);
