# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0
import boto3
from botocore.config import Config

# Parameter Store Field Names used by main workflow
CONF_COMP_LANGS = "ComprehendLanguages"
CONF_REDACTION_LANGS = "ContentRedactionLanguages"
CONF_CONVO_LOCATION = "ConversationLocation"
CONF_ENTITYENDPOINT = "EntityRecognizerEndpoint"
CONF_ENTITY_FILE = "EntityStringMap"
CONF_ENTITYCONF = "EntityThreshold"
CONF_ENTITY_TYPES = "EntityTypes"
CONF_PREFIX_AUDIO_PLAYBACK = "InputBucketAudioPlayback"
CONF_S3BUCKET_INPUT = "InputBucketName"
CONF_PREFIX_RAW_AUDIO = "InputBucketRawAudio"
CONF_PREFIX_FAILED_AUDIO = "InputBucketFailedTranscriptions"
CONF_PREFIX_INPUT_TRANSCRIPTS = "InputBucketOrigTranscripts"
CONF_MAX_SPEAKERS = "MaxSpeakers"
CONF_MINNEGATIVE = "MinSentimentNegative"
CONF_MINPOSITIVE = "MinSentimentPositive"
CONF_S3BUCKET_OUTPUT = "OutputBucketName"
CONF_PREFIX_TRANSCRIBE_RESULTS = "OutputBucketTranscribeResults"
CONF_PREFIX_PARSED_RESULTS = "OutputBucketParsedResults"
CONF_SPEAKER_NAMES = "SpeakerNames"
CONF_SPEAKER_MODE = "SpeakerSeparationType"
COMP_SFN_NAME = "StepFunctionName"
CONF_SUPPORT_BUCKET = "SupportFilesBucketName"
CONF_TRANSCRIBE_LANG = "TranscribeLanguages"
CONF_TELEPHONY_CTR = "TelephonyCTRType"
CONF_TELEPHONY_CTR_SUFFIX = "TelephonyCTRFileSuffix"
CONF_VOCABNAME = "VocabularyName"
CONF_CLMNAME = "CustomLangModelName"
CONF_FILENAME_DATETIME_REGEX = "FilenameDatetimeRegex"
CONF_FILENAME_DATETIME_FIELDMAP = "FilenameDatetimeFieldMap"
CONF_FILENAME_GUID_REGEX = "FilenameGUIDRegex"
CONF_FILENAME_AGENT_REGEX = "FilenameAgentRegex"
CONF_FILENAME_CUST_REGEX = "FilenameCustRegex"
CONF_FILTER_MODE = "VocabFilterMode"
CONF_FILTER_NAME = "VocabFilterName"
CONF_KENDRA_INDEX_ID = "KendraIndexId"
CONF_WEB_URI = "WebUiUri"
CONF_TRANSCRIBE_API = "TranscribeApiMode"
CONF_REDACTION_TRANSCRIPT = "CallRedactionTranscript"
CONF_REDACTION_AUDIO = "CallRedactionAudio"
CONF_CALL_SUMMARIZATION = "CallSummarization"

# Parameter store fieldnames used by bulk import
BULK_S3_BUCKET = "BulkUploadBucket"
BULK_JOB_LIMIT = "BulkUploadMaxTranscribeJobs"
BULK_MAX_DRIP_RATE = "BulkUploadMaxDripRate"

# Transcribe API Modes
API_STANDARD = "standard"
API_ANALYTICS = "analytics"
API_STREAM_ANALYTICS = "analytics-streaming"

# Speaker separation modes
SPEAKER_MODE_SPEAKER = "speaker"
SPEAKER_MODE_CHANNEL = "channel"
SPEAKER_MODE_AUTO = "auto"
SPEAKER_MODES = [SPEAKER_MODE_SPEAKER, SPEAKER_MODE_CHANNEL, SPEAKER_MODE_AUTO]

# Vocabulary filter modes - gets reset to "" if configured value is not one of the list
VOCAB_FILTER_MODES = {"remove", "mask", "tag"}

# Other defined constant values
NLP_THROTTLE_RETRIES = 3

# Configuration data
appConfig = {}

config = Config(
   retries = {
      'max_attempts': 100,
      'mode': 'adaptive'
   }
)

def extractParameters(ssmResponse, useTagName):
    """
    Picks out the Parameter Store results and appends the values to our
    overall 'appConfig' variable.
    """

    # Good parameters first
    for param in ssmResponse["Parameters"]:
        name = param["Name"]
        value = param["Value"]
        appConfig[name] = value

    # Now the bad/missing
    for paramName in ssmResponse["InvalidParameters"]:
        if useTagName:
            appConfig[paramName] = paramName
        else:
            appConfig[paramName] = ""


def loadConfiguration():
    """
    Loads in the configuration values from Parameter Store.  Bulk loads them in batches of 10,
    and any that are missing are set to an empty string or to the tag-name.
    """

    # Load the the core ones in from Parameter Store in batches of up to 10


    # If any important empty values to something
  
    appConfig[CONF_MINNEGATIVE] = 0.5
    appConfig[CONF_MINPOSITIVE] = 0.5
    appConfig[CONF_ENTITYCONF] = 0.5
    appConfig[CONF_FILTER_MODE] = ""
    appConfig[CONF_FILTER_NAME] = ""

    # Validate speaker-separation mode
    
    appConfig[CONF_SPEAKER_MODE] = SPEAKER_MODE_SPEAKER

    # Do any processing (casting, list expansion, etc) that we some parameters need
    appConfig[CONF_MINNEGATIVE] = float(appConfig[CONF_MINNEGATIVE])
    appConfig[CONF_MINPOSITIVE] = float(appConfig[CONF_MINPOSITIVE])
    appConfig[CONF_COMP_LANGS] = "en | hi".split(" | ")
    appConfig[CONF_REDACTION_LANGS] = "en-IN | hi-IN".split(" | ")
    appConfig[CONF_TRANSCRIBE_LANG] = "en-IN | hi-IN".split(" | ")
    appConfig[CONF_SPEAKER_NAMES] = "".split(" | ")
    appConfig[CONF_TELEPHONY_CTR_SUFFIX] = "".split(" | ")
    appConfig[CONF_ENTITYENDPOINT] = ""
    appConfig[CONF_ENTITY_FILE] = ""
    appConfig[CONF_PREFIX_AUDIO_PLAYBACK] = "playbackAudio"
    appConfig[CONF_FILENAME_DATETIME_REGEX] = "-(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_" 
    appConfig[CONF_FILENAME_DATETIME_FIELDMAP] = "%Y %m %d %H %M %S"
    appConfig[CONF_ENTITY_TYPES] = "PERSON | LOCATION | ORGANIZATION | COMMERCIAL_ITEM | EVENT | DATE | QUANTITY | TITLE"
    appConfig[CONF_TELEPHONY_CTR] = "none"


def isAutoLanguageDetectionSet():
    """
    Returns flag to indicate if we need to do Auto Language Detection in Transcribe,
    which is indicated by multiple languages being defined on the config parameter
    """
    return len(appConfig[CONF_TRANSCRIBE_LANG]) > 1


def isTranscriptRedactionEnabled():
    """
    Returns flag to indicate if we need to enable Transcribe redaxtion
    """
    return appConfig[CONF_REDACTION_TRANSCRIPT] == "true"


def isAudioRedactionEnabled():
    """
    Returns flag to indicate if we need to only allow the playback of redacted audio.  This is only
    valid on Call Analytics jobs, as other Transcribe modes don't generate redacted audio, and it
    is only generated if transcription was enabled in the first place
    """
    return isTranscriptRedactionEnabled() and (appConfig[CONF_REDACTION_AUDIO] == "true")
