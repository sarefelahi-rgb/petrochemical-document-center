-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "clearance" TEXT NOT NULL DEFAULT 'INTERNAL',
    "organizationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "categoryAccess" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadOp" (
    "opId" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssistantFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "textContent" TEXT NOT NULL,
    "textSource" TEXT,
    "pageCount" INTEGER,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idleExpiresAt" DATETIME NOT NULL,
    "hardExpiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MfaChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "roleInProject" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Area_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "areaId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Unit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "sizeClass" TEXT,
    "spec" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Line_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "tagType" TEXT NOT NULL DEFAULT 'EQUIPMENT',
    "areaCode" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "docNumber" TEXT NOT NULL,
    "docNumberRaw" TEXT,
    "title" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "unitId" TEXT,
    "origin" TEXT,
    "ownerUnit" TEXT,
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "processingStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "extractionStatus" TEXT NOT NULL DEFAULT 'NOT_EXTRACTED',
    "engineeringStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "currentRevisionId" TEXT,
    "validRevisionId" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntakeItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVAL',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "note" TEXT,
    "extractedText" TEXT,
    "textSource" TEXT,
    "pageCount" INTEGER,
    "aiJson" TEXT,
    "aiConfidence" REAL,
    "aiNote" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "documentId" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntakeItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IntakeItem_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IntakeItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "revisionCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "purpose" TEXT,
    "docDate" DATETIME,
    "receivedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveDate" DATETIME,
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Revision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "tagId" TEXT,
    "lineId" TEXT,
    "rawRef" TEXT,
    "linkStatus" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DocLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AssetTag" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DocLink_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "quarantine" BOOLEAN NOT NULL DEFAULT false,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "scanNote" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileObject_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FileObject_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "availableAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,
    "documentId" TEXT,
    "revisionId" TEXT,
    "organizationId" TEXT NOT NULL,
    "correlationId" TEXT,
    "workerVersion" TEXT,
    "toolVersion" TEXT,
    "settingsJson" TEXT,
    "resultJson" TEXT,
    "error" TEXT,
    "durationMs" INTEGER,
    "claimedAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "heartbeatAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProcessingJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PageText" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "revisionId" TEXT,
    "pageNumber" INTEGER NOT NULL,
    "textRaw" TEXT NOT NULL,
    "textNormalized" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "ocrConfidence" REAL,
    "language" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AUTO',
    "aiPolished" BOOLEAN NOT NULL DEFAULT false,
    "polishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageText_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DerivativeObject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "mimeType" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DerivativeObject_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocExtraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "fileId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "valueRaw" TEXT NOT NULL,
    "valueNorm" TEXT,
    "confidence" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "bbox" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNREVIEWED',
    "isSuggestion" BOOLEAN NOT NULL DEFAULT false,
    "toolVersion" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocExtraction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "fileId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" DATETIME,
    "resolutionNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewTask_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReviewTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "rect" TEXT,
    "text" TEXT,
    "color" TEXT NOT NULL DEFAULT '#facc15',
    "authorId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Annotation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "Revision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Annotation_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Annotation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MtoRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "pageNumber" INTEGER,
    "rowLabel" TEXT,
    "rawDesc" TEXT NOT NULL,
    "normDesc" TEXT,
    "material" TEXT,
    "sizeMain" TEXT,
    "sizeBranch" TEXT,
    "cls" TEXT,
    "schedule" TEXT,
    "endConn" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'EA',
    "qty" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MtoRow_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "reviewerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "requestedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocApproval_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DocApproval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transmittal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sentAt" DATETIME,
    "ackAt" DATETIME,
    "note" TEXT,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TransmittalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transmittalId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "note" TEXT,
    CONSTRAINT "TransmittalItem_transmittalId_fkey" FOREIGN KEY ("transmittalId") REFERENCES "Transmittal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransmittalItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CartableTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assigneeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" TEXT,
    "relatedDocId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "CartableTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Favorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT,
    "objectId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vocabulary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domain" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'گفت‌وگوی جدید',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "comment" TEXT,
    "expectedAnswer" TEXT,
    "question" TEXT,
    "answerSnapshot" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantFeedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AssistantMessage" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssistantFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearnedKnowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "keywords" TEXT,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'FEEDBACK',
    "weight" REAL NOT NULL DEFAULT 1.0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearnedKnowledge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MfaChallenge_tokenHash_key" ON "MfaChallenge"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_userId_projectId_key" ON "ProjectMember"("userId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Area_projectId_code_key" ON "Area"("projectId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_areaId_code_key" ON "Unit"("areaId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Line_unitId_lineNumber_key" ON "Line"("unitId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AssetTag_tag_key" ON "AssetTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "Document_organizationId_projectId_docNumber_key" ON "Document"("organizationId", "projectId", "docNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_documentId_revisionCode_key" ON "Revision"("documentId", "revisionCode");

-- CreateIndex
CREATE INDEX "DocLink_tagId_idx" ON "DocLink"("tagId");

-- CreateIndex
CREATE INDEX "DocLink_lineId_idx" ON "DocLink"("lineId");

-- CreateIndex
CREATE INDEX "FileObject_sha256_idx" ON "FileObject"("sha256");

-- CreateIndex
CREATE INDEX "ProcessingJob_status_availableAt_priority_idx" ON "ProcessingJob"("status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "ProcessingJob_fileId_idx" ON "ProcessingJob"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "PageText_fileId_pageNumber_key" ON "PageText"("fileId", "pageNumber");

-- CreateIndex
CREATE INDEX "DerivativeObject_fileId_kind_pageNumber_idx" ON "DerivativeObject"("fileId", "kind", "pageNumber");

-- CreateIndex
CREATE INDEX "DocExtraction_documentId_idx" ON "DocExtraction"("documentId");

-- CreateIndex
CREATE INDEX "DocExtraction_fileId_field_idx" ON "DocExtraction"("fileId", "field");

-- CreateIndex
CREATE INDEX "ReviewTask_status_idx" ON "ReviewTask"("status");

-- CreateIndex
CREATE INDEX "ReviewTask_documentId_idx" ON "ReviewTask"("documentId");

-- CreateIndex
CREATE INDEX "Annotation_fileId_page_idx" ON "Annotation"("fileId", "page");

-- CreateIndex
CREATE INDEX "MtoRow_documentId_idx" ON "MtoRow"("documentId");

-- CreateIndex
CREATE INDEX "DocApproval_documentId_idx" ON "DocApproval"("documentId");

-- CreateIndex
CREATE INDEX "DocApproval_reviewerId_decision_idx" ON "DocApproval"("reviewerId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "Transmittal_number_key" ON "Transmittal"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TransmittalItem_transmittalId_documentId_key" ON "TransmittalItem"("transmittalId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_documentId_key" ON "Favorite"("userId", "documentId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_at_idx" ON "AuditEvent"("at");

-- CreateIndex
CREATE UNIQUE INDEX "Vocabulary_domain_code_key" ON "Vocabulary"("domain", "code");

-- CreateIndex
CREATE INDEX "AssistantFeedback_organizationId_createdAt_idx" ON "AssistantFeedback"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantFeedback_messageId_userId_key" ON "AssistantFeedback"("messageId", "userId");

-- CreateIndex
CREATE INDEX "LearnedKnowledge_organizationId_active_idx" ON "LearnedKnowledge"("organizationId", "active");

