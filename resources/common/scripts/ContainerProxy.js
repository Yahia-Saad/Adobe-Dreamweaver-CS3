/*!
**********************************************************************
@file ContainerProxy.js

Copyright 2003-2006 Adobe Systems Incorporated.                     
All Rights Reserved.                                                
                                                                    
NOTICE: All information contained herein is the property of Adobe   
Systems Incorporated.                                                                                                                    

***********************************************************************
*/


/**
Object that stores all ribs constants that have significance to other parts of the workflow
*/
function Constants()
{
	/** Property name passed to payloads that contains Session ID */
	this.kPropSessionID = "sessionID";
	/** Property name that stores the installer language */
	this.kPropInstallLanguage = "installLanguage";
	/** Property name that stores the default language */
	this.kPropDefaultLanguage = "defaultLanguage";	
	/** 
	Property name that stores the AdobeCode of the Driver payload.  
	@note This property may not exist if there is no session driver payload
	*/
	this.kPropDriverPayloadCode = "driverAdobeCode";
	/** Property name that must be set so that payloads can't be run outside of an AdobeContext */
	this.kPropAdobeSetupFlag = "ADOBE_SETUP";
	/** Property value for kPropAdobeSetupFlag that allows payloads to be executed from this context */
	this.kValueAdobeSetupFlag = "1";
	/** Property name that stores the installer root so that we can locate payloads when run locally */
	this.kPropSourcePath = "InstallSourcePath";
	/** Property name that's passed to payloads via the PROPERTY_FILE data about whether it's silent mode deployment.  Set this
	 	to "1" in a silent deployment when installing the bootstrapper to prevent the local instance from starting up on install. */
	this.kPropExitWorkflow = "ExitWorkflow";
	/** Prefix used to scope all CAPS properties in the current property map */
	this.kCAPSDataPropertyPrefix = "CAPS_28B98837_8526_4159_B4E7_D0FD5E235960.";
	/** The property value we set to instruct a payload to commit the collection data, rather than
	the individual payload record data.  If this property exists, then the spawned payload needs
	to invoke capsAddCollection() */
	this.kCAPSPropCommitCollectionData = this.kCAPSDataPropertyPrefix + "BootstrapperPackage";
	/** The property value set in the property map that stores the total number of session payloads */
	this.kCAPSPropTotalPayloads = this.kCAPSDataPropertyPrefix + "TotalPayloads";
	/** The property basename we use to list the AdobeCodes of all payloads in the current session.  These 
	payloads need to be committed to the CAPS in the bootstrapper installer.  Payload list is 0-based integer
	index and contiguous */
	this.kCAPSPropPayloadCodeBase = this.kCAPSDataPropertyPrefix + "Payload";
	
	/** Payload/bootstrapper install */
	this.kInstall				= "install";
	/** Payload/bootstrapper remove */
	this.kRemove				= "remove";
	/** Payload/bootstrapper repair */
	this.kRepair				= "repair";
	
	/** Payload operation results. */
	this.kORSuccess				= 0;
	this.kORUserCancel			= 1; 
	this.kORFailed				= 2; 
	this.kORConflictsExist		= 3;
	this.kORUpgradeFailure		= 4; 
	this.kORSuccessWithReboot	= 5; 
	this.kORMissingMedia		= 6; 
	this.kORSuccessWithMessage	= 7; 
	
	/** Cached session data */
	this.cachedSessionData = null;
	/** Cached driver payload */
	this.cachedDriverPayload = null;
	/** Cachced default properties */
	this.cachedDefaultProperties = null;
}

/**
A global instantiation of a Constants object.
*/
var gConstants = new Constants();


/**
Proxy interface to exported JS methods so that both 
ExtendScript and WebKit/IE can query for data
*/
function ContainerProxy()
{
	this.UIHosted = function()
	{
		var isHosted = false;
		try
		{
			isHosted = "object" == typeof window.external;
		}
		catch (ex)
		{
			
		}
		return isHosted;
	};
	
	this._payloadSessionJSON = null;
	this._capsJSON = null;
	
	this.GetRIBSBuildInfo = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetRIBSBuildInfo());
			}
			else
			{
				jsonObj = _jsonToObject(GetRIBSBuildInfo());
			}			
		}
		catch (ex)
		{
			jsonObj = _jsonToObject('{"Version":{"major":0,"minor":0,"revision":63,"build":0,"compatibleUpperBound":"0.0.65.0","compatibleLowerBound":"0.0.61.0"}}');
		}
		return jsonObj;
	}	
	this.GetDefaultProperties = function()
	{	
		var jsonObj = null;
		try
		{
			if (null == this.cachedDefaultProperties)
			{
				if (this.UIHosted())
				{
					jsonObj = _jsonToObject(window.external.GetDefaultProperties());
				}
				else
				{
					jsonObj = _jsonToObject(GetDefaultProperties());
				}	

				// Add a few bits.
				var driver = this.GetDriverPayload();
				if (driver)
				{
					jsonObj["productName"] = driver.ProductName;
					jsonObj["driverAdobeCode"] = driver.AdobeCode;

					// Use the start menu override if appropriate
					var localSessionData = this.GetSessionData();
					if (localSessionData && localSessionData.payloadMap && localSessionData.payloadMap[driver.AdobeCode] && localSessionData.payloadMap[driver.AdobeCode]["StartMenuProgramsSubFolder"])
					{
						var tokenMap = this.GetDirectoryTokenMap();
						if (tokenMap && tokenMap["[StartMenu]"])
						{
							jsonObj["StartMenuSubFolder"] = _concatPaths(new Array(tokenMap["[StartMenu]"], localSessionData.payloadMap[driver.AdobeCode]["StartMenuProgramsSubFolder"]), jsonObj["platform"]);
						}
					}
				}
				else
				{
					jsonObj["productName"] = "Adobe Setup";
				}
				this.cachedDefaultProperties = jsonObj;
			}
			else
			{
				jsonObj = this.cachedDefaultProperties;
			}
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		return jsonObj;		
	}
	this.GetSessionData = function()
	{
		var jsonObj = null;
		try
		{
			if (null == this.cachedSessionData)
			{
				if (this.UIHosted())
				{
					jsonObj = _jsonToObject(window.external.GetSessionData());
				}
				else
				{
					jsonObj = _jsonToObject(GetSessionData());
				}	
				this.cachedSessionData = jsonObj;
			}
			else
			{
				jsonObj = this.cachedSessionData; 
			}
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetDriverPayload = function()
	{
		if (null == this.cachedDriverPayload)
		{
			var sessionData = this.GetSessionData();
			if (sessionData)
			{					
				if (sessionData.driverPayloadID && sessionData.payloadMap)
				{
					this.cachedDriverPayload =  sessionData.payloadMap[sessionData.driverPayloadID];
				}
			}
		}
		return this.cachedDriverPayload;
	}
	this.GetEULASForAdobeCode = function(inAdobeCode, inOptFilterISOCode)
	{
		var jsonObj = null;
		try
		{
			var filterCode = "";
			if (inOptFilterISOCode != null)
				filterCode = inOptFilterISOCode;
				
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetEULASForAdobeCode(inAdobeCode, filterCode));
			}
			else
			{
				jsonObj = _jsonToObject(GetEULASForAdobeCode(inAdobeCode, filterCode));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetRunningApplications = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetRunningApplications());
			}
			else
			{
				jsonObj = _jsonToObject(GetRunningApplications());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	
	this.AcquireBootstrapperLock = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.AcquireBootstrapperLock());
			}
			else
			{
				jsonObj = _jsonToObject(AcquireBootstrapperLock());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		var acquired = false;
		if (jsonObj &&
			1 == jsonObj.success)
		{
			acquired = true;
		}
		return acquired;
	}
	
	this.IsBootstrapperLocked = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.IsBootstrapperLocked());
			}
			else
			{
				jsonObj = _jsonToObject(IsBootstrapperLocked());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		var locked = false;
		if (jsonObj &&
			1 == jsonObj.isLocked)
		{
			locked = true;
		}
		return locked;
	}
	
	this.AcquireSetupLock = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.AcquireSetupLock());
			}
			else
			{
				jsonObj = _jsonToObject(AcquireSetupLock());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		
		var acquired = false;
		if (jsonObj &&
			1 == jsonObj.success)
		{
			acquired = true;
		}
		return acquired;
	}
			
	
	this.IsSetupLocked = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.IsSetupLocked());
			}
			else
			{
				jsonObj = _jsonToObject(IsSetupLocked());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		var locked = false;
		if (jsonObj &&
			1 == jsonObj.isLocked)
		{
			locked = true;
		}
		return locked;
	}
		
	this.IsRestartNeeded = function()
	{
		var jsonObj = null;
		var restartNeeded = false;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.IsRestartNeeded());
			}
			else
			{
				jsonObj = _jsonToObject(IsRestartNeeded());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		
		if (jsonObj && jsonObj["restartNeeded"] && jsonObj["restartNeeded"] == "1")
		{
			restartNeeded = true;
		}
		
		return restartNeeded;
	}
	
	this.GetStringsForLanguage = function(inFullPathToResourcesFile, inOptionalFilterLanguage)
	{
		var jsonObj = null;
		try
		{
			var filterLanguage = "";
			if (inOptionalFilterLanguage &&
				inOptionalFilterLanguage != null)
			{
				filterLanguage = inOptionalFilterLanguage;
			}
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetStringsForLanguage(inFullPathToResourcesFile, filterLanguage));
			}
			else
			{
				jsonObj = _jsonToObject(GetStringsForLanguage(inFullPathToResourcesFile, filterLanguage));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.LoadFile = function(inFullFilePath)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.LoadFile(inFullFilePath));
			}
			else
			{
				jsonObj = _jsonToObject(LoadFile(inFullFilePath));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetSystemInfo = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetSystemInfo());
			}
			else
			{
				jsonObj = _jsonToObject(GetSystemInfo());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	this.GetCommandLineArguments = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetCommandLineArguments());
			}
			else
			{
				jsonObj = _jsonToObject(GetCommandLineArguments());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;	
	}
	this.GetFixedDriveInfo = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetFixedDriveInfo());
			}
			else
			{
				jsonObj = _jsonToObject(GetFixedDriveInfo());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetStreamsForAdobeCode = function(inAdobeCode)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetStreamsForAdobeCode(inAdobeCode));
			}
			else
			{
				jsonObj = _jsonToObject(GetStreamsForAdobeCode(inAdobeCode));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetVolumeStatisticsFromPath = function(inPath)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetVolumeStatisticsFromPath(inPath));
			}
			else
			{
				jsonObj = _jsonToObject(GetVolumeStatisticsFromPath(inPath));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetCAPS = function(inPath)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetCAPS());
			}
			else
			{
				jsonObj = _jsonToObject(GetCAPS());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	
	this.IsValidSerialNumberForAdobeCode = function(inAdobeCode, inSerialNumber)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.IsValidSerialNumberForAdobeCode(inAdobeCode, inSerialNumber));
			}
			else
			{
				jsonObj = _jsonToObject(IsValidSerialNumberForAdobeCode(inAdobeCode, inSerialNumber));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	

	this.IsPortForProtocolAvailable = function(inPort, inProtocol)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.IsPortForProtocolAvailable(inPort, inProtocol));
			}
			else
			{
				jsonObj = _jsonToObject(IsPortForProtocolAvailable(inPort, inProtocol));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	
	this.LogDebug = function(inMessage)
	{
		this._log(5, inMessage);
	}	
	this.LogInfo = function(inMessage)
	{
		this._log(4, inMessage);		
	}
	this.LogWarning = function(inMessage)
	{
		this._log(3, inMessage);
	}
	this.LogError = function(inMessage)
	{
		this._log(2, inMessage);
	}
	this.LogFatal = function(inMessage)
	{
		this._log(1, inMessage);
	}
	this.UIResizeWindow = function(inWidth, inHeight)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIResizeWindow(inWidth, inHeight));
			}
			else
			{
				jsonObj = _jsonToObject(UIResizeWindow(inWidth, inHeight));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetDirectoryTokenMap = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetDirectoryTokenMap());
			}
			else
			{
				jsonObj = _jsonToObject(GetDirectoryTokenMap());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetUserInfo = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetUserInfo());
			}
			else
			{
				jsonObj = _jsonToObject(GetUserInfo());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.GetPathInformation = function(inUserSelectedPath)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetPathInformation(inUserSelectedPath));
			}
			else
			{
				jsonObj = _jsonToObject(GetPathInformation(inUserSelectedPath));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;	
	}

	this.GetPayloadPhysicalInstallState = function(inAdobeCode)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetPayloadPhysicalInstallState(inAdobeCode));
			}
			else
			{
				jsonObj = _jsonToObject(GetPayloadPhysicalInstallState(inAdobeCode));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;	
	}
		
	this.InstallPayload = function(inAdobeCode, inOperation, inObjProperties)
	{
		var jsonObj = null;
		var bencodedDict = this._objectMapToBencodedDictionary(inObjProperties);
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.InstallPayload(inAdobeCode, inOperation, bencodedDict));
			}
			else
			{
				jsonObj = _jsonToObject(InstallPayload(inAdobeCode, inOperation, bencodedDict, 1));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.OpenCAPSSimulation = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.OpenCAPSSimulation());
			}
			else
			{
				jsonObj = _jsonToObject(OpenCAPSSimulation());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.SimulateInstallPayload = function(inAdobeCode, inOperation, inObjProperties)
	{
		var jsonObj = null;
		var bencodedDict = this._objectMapToBencodedDictionary(inObjProperties);
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.SimulateInstallPayload(inAdobeCode, inOperation, bencodedDict));
			}
			else
			{
				jsonObj = _jsonToObject(SimulateInstallPayload(inAdobeCode, inOperation, bencodedDict));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.CloseCAPSSimulation = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.CloseCAPSSimulation());
			}
			else
			{
				jsonObj = _jsonToObject(CloseCAPSSimulation());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.SaveDeploymentFiles = function(inSessionProperties, inPayloadDictionary)
	{
		var objProps = this.GetDefaultProperties();		
		var objDirMap = this.GetDirectoryTokenMap();
		var outputDir = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers"), objProps["platform"]);
		var bencodedDeployment = this._objectMapToBencodedDictionary(inSessionProperties);
		var bencodedPayloads = this._objectMapToBencodedDictionary(inPayloadDictionary);
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.SaveDeploymentFiles(outputDir, bencodedDeployment, bencodedPayloads));
			}
			else
			{
				jsonObj = _jsonToObject(SaveDeploymentFiles(outputDir, bencodedDeployment, bencodedPayloads));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.InstallBootstrapper = function(inOperation)
	{
		// Create the property map object from the current installerSession data. 
		var constants = new Constants();
		
		var objProps = this.GetDefaultProperties();
		var objDirMap = this.GetDirectoryTokenMap();
		 
		// Setup the boostrapper installdir.  This is the [AdobeCommon] + sessionKey value
		objProps["INSTALLDIR"] = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers", objProps["sessionID"]), objProps["platform"]);
		objProps["record"] = this.IsRecordMode() ? "1" : "0";;
		
		// Add the package management data...
		var totalPayloadCount = 0;
		for (var adobeCode in this.GetSessionData().payloadMap)
		{	
			objProps[constants.kCAPSPropPayloadCodeBase + totalPayloadCount] = adobeCode;
			++totalPayloadCount;
		}
		objProps[constants.kCAPSPropTotalPayloads] = totalPayloadCount;

		// Any Add/Remove data published by the driver payload that's available in the current session?
		// (1) default, (2) en_US, (3) first element
		var driverPayload = this.GetDriverPayload();
		if (driverPayload != null)
		{
			this.LogDebug("Adding driver payload ARP data");
			// Is there any add remove info here?
			if (driverPayload.AddRemoveInfo != null)
			{
				var testLang = objProps["defaultLanguage"];
				for (var eachKey in driverPayload.AddRemoveInfo)
				{
					var propertyKeyName = "AddRemoveInfo" + eachKey;
					var arpInfo = driverPayload.AddRemoveInfo[eachKey];
					if (arpInfo[testLang] != null)
					{
						objProps[propertyKeyName] = arpInfo[testLang];
					}
					else if (arpInfo["en_US"] != null)
					{
						objProps[propertyKeyName] = arpInfo["en_US"];
					}
					else
					{
						for (var subLang in arpInfo)
						{
							objProps[propertyKeyName] = arpInfo[subLang];
							break;
						}
					}
					this.LogDebug("Added: " + propertyKeyName + "=" + objProps[propertyKeyName]);
				}
			}
			
			// Suppress uninstallation?
			if (driverPayload.suppressUninstaller && (1 == driverPayload.suppressUninstaller))
			{
				objProps["suppressUninstaller"] = "1";
			}
		}
		else
		{
			this.LogDebug("No driver ARP data available");
		}
		
		// Supress Setup relaunch in silent mode
		if (!this.UIHosted())
			objProps["ExitWorkflow"] = "1";
				
		this.LogDebug("Install bootstrapper parameters:");
		this.LogDebug(objProps);
		var bencodedDict = this._objectMapToBencodedDictionary(objProps);


		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.InstallBootstrapper(inOperation, bencodedDict));
			}
			else
			{
				jsonObj = _jsonToObject(InstallBootstrapper(inOperation, bencodedDict, 1));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetInstallStatus = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.GetInstallStatus());
			}
			else
			{
				jsonObj = _jsonToObject(GetInstallStatus());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.PostInstallThreadMessage = function(inMessage)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.PostInstallThreadMessage(inMessage));
			}
			else
			{
				jsonObj = _jsonToObject(PostInstallThreadMessage(inMessage));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.PeekInstallThreadMessage = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.PeekInstallThreadMessage());
			}
			else
			{
				jsonObj = _jsonToObject(PeekInstallThreadMessage());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.PostInstallThreadMessageResult = function(inMessageID, inResult)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.PostInstallThreadMessageResult(inMessageID, inResult));
			}
			else
			{
				jsonObj = _jsonToObject(PostInstallThreadMessageResult(inMessageID, inResult));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
		
	this.StoreCollectionProperties = function(inCollectionID, inObjProperties)
	{
		var jsonObj = null;
		var bencodedDict = this._objectMapToBencodedDictionary(inObjProperties);
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.StoreCollectionProperties(inCollectionID, bencodedDict));
			}
			else
			{
				jsonObj = _jsonToObject(StoreCollectionProperties(inCollectionID, bencodedDict, 1));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.GetResourcesPath = function()
	{
		var resourcesPath = null;
		
		var commandLineData = this.GetCommandLineArguments();
		
		if (commandLineData
			&& commandLineData.Properties
			&& commandLineData.Properties.resourcesPath)
		{
			resourcesPath = commandLineData.Properties.resourcesPath;
		}
		
		if (null == resourcesPath)
		{
			var objProps = this.GetDefaultProperties();
			if (objProps
				&& objProps.installSourcePath)
			{
				resourcesPath = _concatPaths(new Array(objProps.installSourcePath, "resources"), objProps["platform"]);
			}
		}
		
		return resourcesPath;
	}
	this.SetWorkflowExitCode = function(inExitArgument)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.SetWorkflowExitCode(inExitArgument));
			}
			else
			{
				jsonObj = _jsonToObject(SetWorkflowExitCode(inExitArgument));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.SetSessionInitialized = function(inInitialized)
	{
		var jsonObj = null;
		try
		{
			var initValue = (null != inInitialized) ? inInitialized : "0";
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.SetSessionInitialized(initValue));
			}
			else
			{
				jsonObj = _jsonToObject(SetSessionInitialized(initValue));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
			
	this.UIShowWindow = function(inShow)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIShowWindow(inShow));
			}
			else
			{
				jsonObj = _jsonToObject(UIShowWindow(inShow));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	
	this.UISetWindowTitle = function(inTitle)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UISetWindowTitle(inTitle));
			}
			else
			{
				jsonObj = _jsonToObject(UISetWindowTitle(inTitle));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	
	this.UIEjectRemovableMedia = function(inTitle)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIEjectRemovableMedia(inTitle));
			}
			else
			{
				jsonObj = _jsonToObject(UIEjectRemovableMedia(inTitle));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	
	this.UISetCloseBoxEnabled = function(inEnabled)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UISetCloseBoxEnabled(inEnabled));
			}
			else
			{
				jsonObj = _jsonToObject(UISetCloseBoxEnabled(inEnabled));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	
	this.UISelectInstallLocation = function(inDefaultSelectedPath, inTitleText, inSubtitleText)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UISelectInstallLocation(inDefaultSelectedPath, inTitleText, inSubtitleText));
			}
			else
			{
				jsonObj = _jsonToObject(UISelectInstallLocation(inDefaultSelectedPath, inTitleText, inSubtitleText));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}
	this.UIExitDialog = function(inExitArgument)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIExitDialog(inExitArgument));
			}
			else
			{
				jsonObj = _jsonToObject(UIExitDialog(inExitArgument));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	this.UIGetPasteboardValue = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIGetPasteboardValue());
			}
			else
			{
				jsonObj = _jsonToObject(UIGetPasteboardValue());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	this.UIShowModalAlert = function(inXHTMLString)
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIShowModalAlert(inXHTMLString));
			}
			else
			{
				jsonObj = _jsonToObject(UIShowModalAlert(inXHTMLString));
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	
	this.UIShowManifestErrors = function()
	{
		var jsonObj = null;
		try
		{
			if (this.UIHosted())
			{
				jsonObj = _jsonToObject(window.external.UIShowManifestErrors());
			}
			else
			{
				jsonObj = _jsonToObject(UIShowManifestErrors());
			}			
		}
		catch (ex)
		{
			jsonObj = null;
		}
		return jsonObj;
	}	

	this.IsRecordMode = function()
	{
		var result = false;
		
		var commandLineArgs = this.GetCommandLineArguments();
		if (commandLineArgs && 
			commandLineArgs.Properties && 
			commandLineArgs.Properties.record && 
			commandLineArgs.Properties.record == '1')
		{
			result = true;
		}

		return result;
	};

	this._getBencodingStringLengthUTF8 = function(inString)
	{
		var totalLength = 0;
		for (var i=0; i < inString.length; ++i)
		{
			var unicodeValue = inString.charCodeAt(i);
			if (unicodeValue  <= 128)
			{
				totalLength += 1;	
			}
			else if (unicodeValue <= 2048)
			{
				totalLength += 2;					
			}
			else if (unicodeValue <= 65536)
			{
				totalLength += 3;					
			}
			else
			{
				totalLength += 4;					
			}
		}	
		return totalLength;
	}
	// Convert a JS session object into a bencoded dictionary
	// See http://wiki.theory.org/BitTorrentSpecification#bencoding	
	// Example: d3:cow3:moo4:spam4:eggse -> { "cow" => "moo", "spam" => "eggs" } 
	this._objectMapToBencodedDictionary = function(inObject)
	{
		var dictionary = "d";
		try
		{
			for (var eachProp in inObject)
			{
				var objValue = inObject[eachProp].toString();
				dictionary += eachProp.length + ":" + eachProp.toString() + this._getBencodingStringLengthUTF8(objValue) + ":" + objValue;
			}
			dictionary += "e";
		}
		catch (ex)
		{
			this.LogError("Error converting object to bencoded dictionary: " + ex);
			dictionary = null;
		}
		
		
		return dictionary;
	}			
					
	this._log = function(inLevel, inMessage)
	{
		try
		{
            if (typeof(inMessage) == "object")
            {
                inMessage = this._objectToString(inMessage, 0);
            }		
            
			if (true == this.UIHosted())
			{
                window.external.Log(inLevel, inMessage);
			}
			else
			{
				Log(inLevel, inMessage);	
			}
		}
		catch (ex)
		{
		
		}	
	}

	
	
    /**
    Log an objects's content to the logfile
    */
    this._objectToString = function(inObject, inLevel, inObjectChain)
    {
    	var retString = "";
	    if (null == inObject)
		    return retString;	
    	
		// objectChain is the chain of parent objects in the conversion to a string.
		// These represent the depth and are used to check for referential loops
		var objectChain = inObjectChain ? inObjectChain : new Array;
		
		// chainWithSelf is the chain of objects that would be passed to _objectToString
		// when appending child objects and is used to check for referential loops
		var chainWithSelf = objectChain.concat([inObject]);
		
	    var depth = objectChain.length;
	    var indentString = "";
	    for (var i=0; i < depth; ++i)
		    indentString += "\t";
	    try
	    {
			var firstPass = true;
		    for (var item in inObject)
		    {
				if (firstPass && inLevel <= 0)
				{
					retString += "Log of: " + typeof(inObject) + "\n";
					firstPass = false;
				}
				// add item property name and type to output
			    var itemObject = inObject[item];
				
				// check for reference loops
				var loopFound = false;
				for (var i = 0; i < chainWithSelf.length; ++i)
				{
					if (itemObject === chainWithSelf[i])
					{
						// loop detected, indicate loop
					    var logText = indentString + item + " {LOOP}: Reference to object up " + (chainWithSelf.length - i - 1);
					    retString += logText + "\n";
						loopFound = true;
						break;
					}
				}
				
				// output the item object if it wasn't a loop
				if (!loopFound)
				{
				    var logText = indentString + item + " {" + typeof(itemObject) + "}: ";
					if ("function" == typeof itemObject)
						logText += "[function body omitted]";
					else
				    	logText += itemObject;
				    retString += logText + "\n";
					retString += this._objectToString(itemObject, inLevel, chainWithSelf);
				}
		    }
	    }
	    catch (e)
	    {
		    this.LogError(2, "Unable to log object.  Error: " + e);	
	    }
	    return retString;
    }
}
