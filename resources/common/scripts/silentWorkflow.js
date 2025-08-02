/*!
**********************************************************************
@file silentWorkflow.js

Copyright 2003-2006 Adobe Systems Incorporated.                     
All Rights Reserved.                                                
                                                                    
NOTICE: All information contained herein is the property of Adobe   
Systems Incorporated.                                                                                                                    

***********************************************************************
*/

/** Global session instance */
var gSession = null;

var kInstallerActionNone = "none"
var kInstallerActionInstall = "install";
var kInstallerActionRemove = "remove";
var kInstallerActionRepair = "repair";

var kOpResultSuccessWithReboot = 5;
var kOpResultSuccess = 0;

/**  SilentWorkflow */
function SilentWorkflow()
{
	this.bootstrapperInstalled = false;
	this.inContainer = null;
	this.deploymentData = null;
	this.installPayloadCount = -1;
	this.repairPayloadCount = -1;
	this.removePayloadCount = -1;
	this.totalPayloadCount = 0;
	this.alreadyDidExit = false;
	this.isFixedInstallDir = false;
	this.PayloadsToCheck = new Array();
	this.restartNeeded = false;
	this.removableMediaErrors = 0;
	this.payloadSerialWarnings = new Array();


	/**  Translate a LocalizedString for logging.
	If the supplied object is not a LocalizedString, assume it is a string and return
	it directly. */
	this._stringForLog = function(inStringOrObj)
	{
		var result = inStringOrObj;
		if (inStringOrObj.Translate && typeof inStringOrObj.Translate == "function" && gSession && gSession.localization)
		{
			result = inStringOrObj.Translate(gSession.localization, "en_US");
		}
		return result;
	}


	/**
	Fabricate the DOM for a system check error/warning
	*/
	this._logStuff = function(inClass, inText)
	{
		var session = gSession;

		var isArray = function(inObj)
		{
			return typeof inObj == "object" && inObj.length && inObj.concat && inObj.join;
		};

		var isLocalizedString = function(inObj)
		{
			return typeof inObj == "object" && inObj.Translate && typeof inObj.Translate == "function";
		};

		var resolveString = function(inObj, forLog)
		{
			if (isLocalizedString(inObj))
			{
				if (forLog)
					return inObj.Translate(session.localization, 'en_US');
				else
					return inObj.Translate(session.localization);
			}
			return inObj;
		};

		var contentList = inText;
		if (!isArray(inText))
			contentList = new Array(inText);

		for (var i in contentList)
		{
			var item = contentList[i];
			if (isArray(item))
			{
				if (item.length > 0)
				{
					for (var si in item)
					{
						if (inClass == "alertCritical")
							session.LogError(" - " + resolveString(item[si], true));
						else
							session.LogWarning(" - " + resolveString(item[si], true));
					}
				}
			}
			else
			{
				if (inClass == "alertCritical")
					session.LogError(resolveString(item, true));
				else
					session.LogWarning(resolveString(item, true));
			}
		}
	}


	/**  Install the bootstrapper
	returning true if sucessfully installed, false if not installed */
	this.silentInstallBootstrapper = function()
	{
		var retVal;
		if (this.inContainer)
		{		
			retVal = this.inContainer.InstallBootstrapper("install");
		}
	
		return (retVal && retVal.success == 1);
	};


	/**  Remove the bootstrapper, if the session is in a valid state for it to be removed
	returning true if sucessfully removed, false if not removed or found */
	this.silentUninstallBootstrapper = function()
	{
		var retVal;
		var shouldRemove = true;

		if (this.inContainer && this.bootstrapperInstalled)
		{
			if (gSession && gSession.sessionCollection)
			{
				var capsData = gSession.GetCAPS();
				
				if (capsData && capsData.Payloads)
				{
					for (p in capsData.Payloads)
					{
						for (c in capsData.Payloads[p].Collections)
						{
							if (gSession.sessionCollection.collectionID == capsData.Payloads[p].Collections[c].collectionID)
								shouldRemove = false;
						}
					}
				}
			} 
			
			if (shouldRemove)	
				retVal = this.inContainer.InstallBootstrapper("remove");
		}
	
		return (retVal && retVal.success == 1);
	}

	
	/** Get the deployment file data */
	this.loadDeploymentFile = function()
	{
		var retVal = false;
		var commandlineArgs = this.inContainer.GetCommandLineArguments();
		
		if (commandlineArgs && commandlineArgs.DeploymentData)
		{
			this.deploymentData = commandlineArgs.DeploymentData;
			retVal = true;
		} 
		
		return retVal;
	};
	

	/** Callback for installer progress, for looks */
	this.operationCallback = function(inOperationStatus)
	{
		var message  = null;
		try
		{
			message = gSession.PeekInstallThreadMessage();		
		}
		catch (ex)
		{
			gSession.LogFatal("Exception in message handling: " + ex);
			if (message && message.messageID)
				gSession.PostInstallThreadMessageResult(message.messageID, 0);
		}

		if (inOperationStatus.areAllOperationsComplete() == true)
		{
			if (!this.alreadyDidExit)
			{
				var thisCB = this;
				this.alreadyDidExit = true;
			}
		} 
		
		return (!this.alreadyDidExit);
	};	
	
	
	/**  Output the session errors, if any, to the log file */	
	this.logSessionErrors = function()
	{
		if (gSession.sessionErrorMessages && gSession.sessionErrorMessages[0])
		{
			gSession.LogFatal("Critical errors were found in setup:");

			for (var i = 0; i < gSession.sessionErrorMessages.length; i++)
				gSession.LogFatal(" - " + gSession.sessionErrorMessages[i][1]);
		}
	}
	

	/**  Run the silent workflow, including bootstrapping and installation
	return true if we ran as expected, false if with any error */
	this.runSilent = function()
	{	
		var retVal = false;
		var objProps;
		var objDirMap;
		var uiCallbackObj;

		// --------------------------- A. Bootstrap workflow ---------------------------
		// Here we can't yet log exceptions; depend on ES workflow to catch exceptions outside try
		this.inContainer = new ContainerProxy;	
		
		// Check to see if the bootstrapper is installed; if not, install it
		if (this.inContainer)
		{
			// Check security credentials
			var userCredentials = this.inContainer.GetUserInfo();
			var isValid = (null != userCredentials);
			if (userCredentials && userCredentials.hasCredentials)
				isValid = (1 == userCredentials.hasCredentials) ? true : false;
				
			if (!isValid)
			{
				inContainer.LogError("The current user doesn't have sufficient security credentials to install this software.");
				throw "The current user doesn't have sufficient security credentials to install this software";	
			}
			
			objProps = this.inContainer.GetDefaultProperties();
			objDirMap = this.inContainer.GetDirectoryTokenMap();
		
			if (objProps && objDirMap)
			{
				var bootstrapInstallDir = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers", objProps["sessionID"], "resources", "scripts", "InstallerSession.js"), objProps["platform"]);
				var pageDataObj = this.inContainer.LoadFile(bootstrapInstallDir);
						
				if (pageDataObj)
				{
					var pageData = pageDataObj.data;
					
					if (!pageData)
					{
						if (this.silentInstallBootstrapper())
							this.bootstrapperInstalled = true;
						else
							throw "Could not install the bootstrapper"; 
					} 
					else
					{
						this.bootstrapperInstalled = true;
					}
				} 
				else
				{
					throw "Failure searching for installed bootstrapper: missing files";
				}
			}
			else
			{
				throw "Failure searching for installed bootstrapper: could not aquire container properties";
			}
		}
		else
		{
			throw "Failure searching for installed bootstrapper: could not create the container";
		}

		// --------------------------- B. Main Workflow  ---------------------------
		// Here we can use logging upon finding an exception, once we create our session
		try
		{ 
			if (this.bootstrapperInstalled)
			{	
				// --------------------------- Load the JavaScript support files ---------------------------
				var filesToLoad = new Array("constants.js", "InstallerPayload.js", "InstallerSession.js", "UICallback.js", "WizardWidgets.js",
											"WizardPage.js", "WizardControl.js", "WizardPayload.js");

				if (objProps && objDirMap)
				{	
					// Standard files
					for (var i = 0; i < filesToLoad.length; i++)
					{
						// Get the path to the file in question
						var bootstrapInstallDir = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers", objProps["sessionID"], "resources", "scripts", filesToLoad[i]), objProps["platform"]);
						var pageDataObj = this.inContainer.LoadFile(bootstrapInstallDir);

						if (pageDataObj)
						{
							var pageData = pageDataObj.data;

							if (pageData && pageData != '')
								var pageClass = eval(pageData);
						}
					} 
				
					// System Requirements file
					var bootstrapInstallDir = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers", objProps["sessionID"], "resources", "pages", "systemCheck", "systemCheck.js"), objProps["platform"]);
					var pageDataObj = this.inContainer.LoadFile(bootstrapInstallDir);

					if (pageDataObj)
					{
						var pageData = pageDataObj.data;

						if (pageData && pageData != '')
							var pageClass = eval(pageData);
					}
				}
				
				try {
					// Verify we have the building blocks we need
					if (systemCheck_wp == null)
						throw "systemCheck.js";
						
					if (UICallback == null)
						throw "UICallback.js";						
						
					if (InstallerSession == null)
						throw "InstallerSession.js";
						
					if (InstallerPayload == null)
						throw "InstallerPayload.js";	
						
					if (WizardButton == null)
						throw "WizardWidgets.js";	
						
					if (WizardPage == null)
						throw "WizardPage.js";													

					if (WizardControl == null)
						throw "WizardControl.js";
						
					if (WizardPayload == null)
						throw "WizardPayload.js";													
				} 
				catch (exc)
				{
					if (exc)
						throw "JavaScript Support file could not be loaded: " + exc;
					else
						throw "JavaScript Support files could not be loaded";
				}
				
				// --------------------------- Initialize the session ---------------------------
				gSession = new InstallerSession();
				uiCallbackObj = new UICallback();
				
				if (this.inContainer)
				{
					this.inContainer.LogInfo(""); 
					this.inContainer.LogInfo("-----------------------------------------------------------------");	
					this.inContainer.LogInfo("----------------- BEGIN Silent Installer Session ----------------");
					this.inContainer.LogInfo("-----------------------------------------------------------------");
				}
				
				if (gSession) 
				{
					// Load the main localization
					var xmlPath = _concatPaths(new Array(objDirMap["[AdobeCommon]"], "Installers", objProps["sessionID"], "resources", "main.xml"), objProps["platform"]);
					gSession.localization = new Localization(gSession, xmlPath, gSession.properties, true);

					if (!gSession.CreatePayloadSession(uiCallbackObj))
					{
						var setupCount = 0;
						var setupName = "Setup";
						var allRunningApps = gSession.GetRunningApplications();

						if (allRunningApps && allRunningApps.Applications && allRunningApps.Applications[0])
						{	
							for (var appIndex=0; appIndex < allRunningApps.Applications.length; ++appIndex)
							{		
								if (allRunningApps.Applications[appIndex].friendlyName == "Setup" || allRunningApps.Applications[appIndex].friendlyName == "Adobe Setup" )
								{
									setupName = allRunningApps.Applications[appIndex].friendlyName;
									setupCount++;
								}
							}
						}
						
						if (setupCount > 1)
							throw "Installation cannot continue until other instances of Setup are closed.";
						else
							throw "Failed to create payload session";
					}
				
					if (null == gSession.sessionPayloads)
						throw "Could not initialize the session: session payloads are not defined"
					else
						gSession.LogInfo("Initialized the session for the silent workflow");
				} 
				else
				{
					throw "Could not initialize the session: failure creating new installer session";
				}
				if (!gSession.IsBootstrapped())
				{
					gSession.sessionErrorMessages.push(["sessionErrorInstallerDatabaseInvalid", "The installer database is invalid.  Please re-install the product from the original media."]);
					throw "The installer database is invalid.  Please re-install the product from the original media.";
				}
				
				// --------------------------- Load the deployment file ---------------------------
				if (!this.loadDeploymentFile())
					throw "Payload deployment data is invalid or missing";
				else 
					gSession.LogInfo("Found deployment data: \n" + this.inContainer._objectToString(this.deploymentData, 1));
				
				// --------------------------- Set the installation properties ---------------------------
				
				// Set the default INSTALLDIR, as long as we can find the driver payload
				var driver = gSession.GetDriverPayload();
				if (driver)
				{
					if (driver.INSTALLDIR && ("1" == driver.INSTALLDIR.isFixed))
					{
						this.isFixedInstallDir = true;
						gSession.LogInfo("Ignoring deployment input for the INSTALLDIR: marked as fixed");
					}
					
					if (driver.INSTALLDIR)
					{
						var installdir;
						if (driver.INSTALLDIR[objProps["platform"]])
							installdir = driver.INSTALLDIR[objProps["platform"]];
						else
							installdir = driver.INSTALLDIR["default"];
				
						if (installdir)
						{
							for (var eachAttr in objDirMap)
								installdir = installdir.replace(eachAttr, objDirMap[eachAttr]);

							installdir = _concatPaths(new Array(installdir), objProps["platform"]);
							gSession.properties["INSTALLDIR"] = installdir;
							gSession.LogInfo("Set the default INSTALLDIR to: " + gSession.properties["INSTALLDIR"]);
						}
					}
					else
					{
						gSession.LogWarning("Could not set the default INSTALLDIR: driver payload does not have an INSTALLDIR attribute");
					}
				}
				else
				{
					gSession.LogWarning("Could not set the default INSTALLDIR: could not find the driver payload");
				}
				
				if (this.deploymentData.Properties)
				{
					gSession.LogInfo("Found deployment properties: ");
					for (var prop in this.deploymentData.Properties)
					{
						// Installation Directory
						if (prop == "INSTALLDIR" && !this.isFixedInstallDir)
						{
							gSession.properties["INSTALLDIR"] = _concatPaths(new Array(this.deploymentData.Properties[prop]), objProps["platform"]);
							gSession.LogInfo("Setting property \"INSTALLDIR\" to: " + gSession.properties["INSTALLDIR"]);
					
						}
						// Install language
						else if (prop == "installLanguage")
						{
							gSession.properties[gConstants.kPropInstallLanguage] = this.deploymentData.Properties[prop];
							gSession.LogInfo("Setting property \"" + gConstants.kPropInstallLanguage + "\" to: " + gSession.properties[gConstants.kPropInstallLanguage] );
							
							var supportedLanguages = gSession.GetSupportedLanguagesArray();

							if (supportedLanguages && supportedLanguages[0])
							{
								gSession.LogInfo("Attempting to find the selected language in the set of available payload languages");
								var foundLanguage = false;
								
								for (var i = 0; i < supportedLanguages.length; i++)
								{
									if (supportedLanguages[i] == gSession.properties[gConstants.kPropInstallLanguage])
									{
										foundLanguage = true;
										break;
									}
								}
								
								if (!foundLanguage)
									throw "Language " + gSession.properties[gConstants.kPropInstallLanguage] + " is not in the list of supported languages";
							}
							else
							{
								throw "Could not get the list of supported languages";
							}
						}
						// Any other properties
						else if (prop != "INSTALLDIR")
						{
							gSession.properties[prop] = this.deploymentData.Properties[prop];
							gSession.LogInfo("Setting property \"" + prop + "\" to: " + gSession.properties[prop]);
						}
					}
				}
				else
				{
					throw "Could not set the properties from the silent deployment file";
				}	

				// --------------------------- Set the payload choices ---------------------------
				if (this.deploymentData.PayloadActions)
				{
					gSession.LogInfo("Found payload actions: ");
					this.installPayloadCount = 0;
					this.removePayloadCount = 0;
					this.repairPayloadCount = 0;

					var deploymentCount = this.deploymentData.PayloadActions.length;
					var deploymentMap = new Object();

					// 1. Decide the mode.  We can't mix remove with install/repair because we don't know
					// how to sort the operations in that case.  We also throw errors here if the deployment
					// file specifies AdobeCodes not in our session.

					gSession.LogDebug("Deciding what installer mode to use...");
					
					this.mode = gSession.IsMaintenanceMode() ? null : kInstallerModeInstall;

					for (var i in this.deploymentData.PayloadActions)
					{
						var payload = gSession.sessionPayloads[this.deploymentData.PayloadActions[i].adobeCode];
						if (payload)
						{
							var actionString = this.deploymentData.PayloadActions[i].action;
							gSession.LogDebug("Requested action \"" + actionString + "\" for " + payload.LogID());
							switch (actionString)
							{
								case kInstallerActionInstall:
									if (this.mode == kInstallerModeRemove)
									{
										throw "Cannot mix install/repair actions with remove actions in a deployment file."
									}
									if (this.mode == null) // null == !kInstallerModeModify
									{
										this.mode = kInstallerModeModify;
									}
									break;
								case kInstallerActionRepair:
									if (this.mode == kInstallerModeRemove)
									{
										throw "Cannot mix install/repair actions with remove actions in a deployment file."
									}
									if (this.mode == kInstallerModeInstall)
									{
										throw "Cannot repair payloads in install mode."
									}
									this.mode = kInstallerModeModify;
									break;
								case kInstallerActionRemove:
									if (this.mode == kInstallerModeModify || this.mode == kInstallerModeInstall)
									{
 										throw "Cannot mix install/repair actions with remove actions in a deployment file."
									}
									this.mode = kInstallerModeRemove;
									break;
								case kInstallerActionNone:
									// no-op
									break;
								default:
									throw "Invalid mode \"" + actionString + "\" for payload " + payload.LogID();
							}
							deploymentMap[this.deploymentData.PayloadActions[i].adobeCode] = actionString;
						}
						else
						{
							throw "An invalid AdobeCode was specified in the deployment file: " + this.deploymentData.PayloadActions[i].adobeCode;
						}
					}
					
					// If nothing is in the deployment file and we are in maintenance mode, assume modify
					if (this.mode == null)
						this.mode = kInstallerModeModify;
						
					gSession.LogDebug("Using installer mode " + this.mode);

					// --------------------------- Check for Personalization ---------------------------
					if (this.mode != kInstallerModeRemove)
					{
						var validResults = null;
						var serialNumberValid = "0";
						var serialNumberOutput = "";
						var mustProvideSerial = false;

						gSession.LogInfo("Checking for personalization streams");

						// If any payload in this session has a SIF, add it to the list to check
						for (var pay in gSession.sessionPayloads)
						{
							validResults = gSession.GetStreamsForAdobeCode(pay);

							if (validResults && validResults["Streams"]) 
							{
								if (validResults["Streams"][0]) 
								{
									for (var i = 0; i < validResults["Streams"].length; i++) 
									{
										if (validResults["Streams"][i]["name"] == "SIF")
										{
											this.PayloadsToCheck.push(pay);

											if (gSession.GetDriverPayload() && gSession.GetDriverPayload().AdobeCode && (pay == gSession.GetDriverPayload().AdobeCode))
											{
												gSession.LogInfo("Driver payload includes a serial check: defined \"serialNumber\" property required to install/repair");
												mustProvideSerial = true;
											}
										}
									}
								}	
							}
						}

						// Check the serial number if a SIF was found in any payload
						if (this.PayloadsToCheck && this.PayloadsToCheck[0])
						{
							gSession.LogInfo("Checking for personalization information");

							// If a serial number was provided OR we have a driver with a SIF, we must match the number
							if (gSession.properties["serialNumber"] || mustProvideSerial)
							{
								if (!(gSession.properties["serialNumber"] && gSession.properties["serialNumber"].length == 24))
									throw "Property \"serialNumber\" is not valid: number is not present or well-formed";

								var serialResults = null;

								// Check each payload with a SIF
								for (var i = 0; i < this.PayloadsToCheck.length; i++)
								{
									serialResults = null;
									serialResults = gSession.IsValidSerialNumberForAdobeCode(this.PayloadsToCheck[i], gSession.properties["serialNumber"]);

									if (!(serialResults && serialResults["isValid"] && serialResults["isValid"] == "1"))
										break;
								}			

								if (serialResults) {
									if (null == serialResults["_error"] || "0" == serialResults["_error"]) {
										serialNumberOutput = serialResults["serialOutput"];
										serialNumberValid = serialResults["isValid"];
									}
								}

								if ("1" == serialNumberValid) 
									gSession.properties["pers_EPIC_SERIAL"] = serialNumberOutput;
								else 
									throw "Property \"serialNumber\" is not valid: number does not match product"

								gSession.LogInfo("Found a valid serial number");
							}
							// If no serial was provided and we aren't asked to provide one for the driver, allow us to pass with a warning
							else
							{
								gSession.LogWarning("No 'serialNumber' property provided");
								gSession.LogWarning("Skipping installation of the following payloads:");
								for (var i = 0; i < this.PayloadsToCheck.length; i++)
								{
									var p = gSession.sessionPayloads[this.PayloadsToCheck[i]];
									gSession.LogWarning("- " + p.GetProductName());
									this.payloadSerialWarnings.push(p.GetProductName());

									gSession.sessionPayloads[this.PayloadsToCheck[i]].SetInstallerAction(kInstallerActionNone);
								}
							}
						}
						else
						{
							gSession.LogInfo("Skipping personalization checks");
						}
					}

					// Clear the plaintext serial number, as we don't wish to store this (valid even if no SN was given)	
					gSession.properties["serialNumber"] = "";

					// 2. Initialize the payload graph
					gSession.PayloadPolicyInit(this.mode);

					// 3. Iterate deployment payloads, and SetAction
					gSession.LogInfo("BEGIN Setting requested payload actions");
					var payloadList = PayloadDependencySort(gSession.sessionPayloads, this.mode == kInstallerModeRemove);
					var payloadPolicyFailure = false;
					for (var anAdobeCode in payloadList)
					{
						var payload = payloadList[anAdobeCode];
						var actionString = deploymentMap[payload.GetAdobeCode()];

						// Force driver to be checked
						if (null == actionString && payload.IsDriverForSession(gSession) && this.mode == kInstallerModeInstall)
						{
							actionString = kInstallerActionInstall;
						}

						var uiPolicy = payload.policyNode.GetUIPolicy();

						if (actionString == kInstallerActionInstall || actionString == kInstallerActionRepair || actionString == kInstallerActionRemove)
						{
							gSession.LogDebug("Setting action for " + payload.LogID() + " per deployment file.");
							if (uiPolicy.selectable || (this.mode != kInstallerModeRemove && payload.IsDriverForSession(gSession)))
							{
								payload.policyNode.SetAction(kPolicyActionYes);
							}
							else
							{
								gSession.LogInfo("Selection of payload " + payload.LogID() + " is forbidden by the policy.");
							}

							if (payload.policyNode.GetAction() != kPolicyActionYes)
							{
								// Ooops, we hit a constraint of some sort.  Log the info.
								payloadPolicyFailure = true;
								this._logStuff("alertWarning", "Error setting action for " + payload.LogID() + ":");
								if (payload.policyNode._message)
								{
									if (payload.policyNode._message.note)
									{
										this._logStuff("alertWarning", payload.policyNode._message.note);
									}
									if (payload.policyNode._message.detail)
									{
										for (var i in payload.policyNode._message.detail)
										{
											var detailItem = payload.policyNode._message.detail[i];
											this._logStuff(detailItem.className, detailItem.text);
										}
									}
								}
							}
						}
						else
						{
							// Payload was not specified in the deployment and it is user selectable, set the action
							if (uiPolicy.selectable)
							{
								//if (!(this.mode == kInstallerModeRemove && payload.GetSatisfiedArray().length > 0))
								{
									payload.policyNode.SetAction(deploymentCount > 0 ? kPolicyActionNo : kPolicyActionYes);
								}
							}
						}
					}

					// For uninstall mode, mark driver and dependencies for uninstall
					// if all non-dependencies are marked for uninstall.
					if (this.mode == kInstallerModeRemove)
					{
						var driverAction = kPolicyActionYes;
						for (var anAdobeCode in payloadList)
						{
							var payload = payloadList[anAdobeCode];
							var uiPolicy = payload.policyNode.GetUIPolicy();
							if (uiPolicy.selectable && payload.policyNode.GetAction() == kPolicyActionNo)
							{
								driverAction = kPolicyActionNo;
								break;
							}
						}

						if (gSession.GetSessionData().driverPayloadID)
						{
							var driver = gSession.sessionPayloads[gSession.GetSessionData().driverPayloadID];
							if (driver && driver.policyNode)
							{
								driver.policyNode.SetAction(driverAction);
							}
						}
					}

					// Tally up the operations
					for (var anAdobeCode in payloadList)
					{
						var payload = payloadList[anAdobeCode];
						var actionString = payload.GetInstallerAction();

						if (actionString == kInstallerActionInstall)
							this.installPayloadCount++;
						else if (actionString == kInstallerActionRepair)
							this.repairPayloadCount++;
						else if (actionString == kInstallerActionRemove)
							this.removePayloadCount++;
					}

					gSession.LogInfo("END Setting requested payload actions");
					if (payloadPolicyFailure)
					{
						gSession.LogWarning("Some payload actions specified in the deployment file could not be applied.")
						throw "Payload actions could not be set. Search the log for \"BEGIN Setting requested payload actions\" for details.";
					}
					else
					{
						LogPayloadSet(gSession, "Payload operations from deployment file and policy", gSession.sessionPayloads,
							function(p) { return "with operation " + p.GetInstallerAction(); });
					}
					
					// 4. Iterate all session payloads we are operating on and check the media
					for (var anAdobeCode in gSession.sessionPayloads)
					{
						var payload = gSession.sessionPayloads[anAdobeCode];
						if (payload && 
							payload.policyNode.GetAction == kPolicyActionYes &&
							payload._sessionData && 
							payload._sessionData.MediaInfo && 
							payload._sessionData.MediaInfo.type && 
							payload._sessionData.MediaInfo.path && 
							payload._sessionData.MediaInfo.type == 1)
						{
							// If this payload is not in the payloads folder, mark it as an error
							var mediaPathInfo = gSession.GetPathInformation(payload._sessionData.MediaInfo.path);
							// Test to see if the disk needed is there, if not, prompt
							if (!(mediaPathInfo && mediaPathInfo.isValidPath && mediaPathInfo.isValidPath == 1 && mediaPathInfo.pathExists && mediaPathInfo.pathExists == 1))
							{
								gSession.sessionErrorMessages.push(["sessionErrorMediaInvalidSilent", payload.LogID() + ": payload not found in the local payloads folder"]);
								this.removableMediaErrors++;	
							}
						} 
					}

					if (this.removableMediaErrors > 0)
					{
						throw "Removable media cannot be used for silent installation; please copy payloads to the local \"payloads\" folder to proceed";
					}
				}
				else
				{
					throw "Could not set the installer payload choices from the silent deployment file";
				}
				
				// --------------------------- Test the INSTALLDIR var various maladies ---------------------------
				if (this.installPayloadCount > 0 || this.repairPayloadCount > 0)
				{
					var installPathInfo = gSession.GetPathInformation(gSession.properties["INSTALLDIR"]);
					
					if (installPathInfo)
					{
						gSession.LogInfo("Collected advanced path check information for INSTALLDIR");

						// Check for invalid characters
						if (1 == installPathInfo.isValidCharacters)
							gSession.LogInfo("INSTALLDIR contains only valid characters");
						else
							throw "INSTALLDIR contains invalid characters";	

						// Check for length
						if (1 == installPathInfo.isValidLength)
							gSession.LogInfo("INSTALLDIR path does not exceed the maximum length");
						else
							throw "INSTALLDIR path exceeds the maximum allowable length";

						// Check for well-formed path
						if (1 == installPathInfo.isValidPath)
							gSession.LogInfo("INSTALLDIR is a well-formed path");
						else
							throw "INSTALLDIR is not a well-formed path";						

						// Check for root path
						if (1 == installPathInfo.isRootPartition)
							throw "INSTALLDIR cannot be the root path";
						else
							gSession.LogInfo("INSTALLDIR is not the root path");
						
						if (1 == installPathInfo.rootPath)
							throw "INSTALLDIR cannot be the root path";
						else
							gSession.LogInfo("INSTALLDIR is not the root path");

						// Check for local
						if (1 == installPathInfo.volumeInfo.isLocal)
							gSession.LogInfo("INSTALLDIR is on a local volume");
						else
							throw "INSTALLDIR is not on a local volume"; 

						// Check for writable
						if (1 == installPathInfo.volumeInfo.isWritable)
							gSession.LogInfo("INSTALLDIR is on a writable volume");
						else
							throw "INSTALLDIR path is not on a writable volume";

						// Check for case-sensitive
						if (1 == installPathInfo.volumeInfo.isCaseSensitive)
							throw "INSTALLDIR is on a case sensitive volume";	
						else
							gSession.LogInfo("INSTALLDIR is not on a case sensitive volume");				

						// Update space required
						gSession.LogInfo("Calculating space required...");	
						var spaceRequiredVolumeList = _calculateRequiredSpace(gSession);
						
						// Check space required for each volume
						if (spaceRequiredVolumeList)
						{	
							for (var volumeName in spaceRequiredVolumeList)
							{
								gSession.LogInfo("Checking space for volume: " + volumeName);
								var sizeInfoForVolume = gSession.GetVolumeStatisticsFromPath(volumeName);
							
								if (sizeInfoForVolume)
								{
									if (spaceRequiredVolumeList[volumeName] > sizeInfoForVolume.freeSize)
										throw "Space on the volume " + sizeInfoForVolume.friendlyName + " is not sufficient to install: at least " + bytesToText(spaceRequiredVolumeList[volumeName]-sizeInfoForVolume.freeSize) + " needed to continue";
									else
										gSession.LogInfo("Space on volume " + sizeInfoForVolume.friendlyName + " is sufficient to install");
								}
								else
								{
									throw "Could not collect volume statistics for INSTALLDIR's volume";
								}
							}
						}
						else
						{
							throw "Could not collect volume statistics for verification of disk sizes";
						}
					}
					else
					{
						throw "Could not collect path information for directory INSTALLDIR";
					}
				}

				gSession.LogInfo("INSTALLDIR passed path basic path validation: " + gSession.properties["INSTALLDIR"]);
				
				// --------------------------- Do System/Conflict/Manifest Error Checks ---------------------------
				var sysCheckPage = new systemCheck_wp(null);
				var hasBlockingAppConflict = false;

				if (sysCheckPage)
				{
					// Conflicting Processes
					var commandlineArgs = this.inContainer.GetCommandLineArguments();
					
					if (commandlineArgs && commandlineArgs.Properties && commandlineArgs.Properties.skipProcessCheck && commandlineArgs.Properties.skipProcessCheck == '1')
					{
						gSession.LogInfo("Skipping conflicting process check...");
					}
					else
					{
						gSession.LogInfo("Checking conflicting processes...");
						var runningAppWarningsAndErrors = sysCheckPage.updateRunningAppsList(gSession);

						if (runningAppWarningsAndErrors && (runningAppWarningsAndErrors[0] || runningAppWarningsAndErrors[1])) 
						{
							if (runningAppWarningsAndErrors[0].length > 0)
							{
								hasBlockingAppConflict = true;
								gSession.LogError("Installation cannot continue until the following applications are closed:");

								for (var i=0; i<runningAppWarningsAndErrors[0].length; i++)
								{
									gSession.LogError(" - " + runningAppWarningsAndErrors[0][i]);
								}
							}

							if (runningAppWarningsAndErrors[1].length > 0)
							{
								gSession.LogWarning("Please quit the following running applications prior to installation:");

								for (var i=0; i<runningAppWarningsAndErrors[1].length; i++)
								{
									gSession.LogWarning(" - " + runningAppWarningsAndErrors[1][i]); 
								}
							}	
						}
					}

					/*
					// System checks
					// Only check system requirements if we are installing something for the first time
					if (this.installPayloadCount > 0)
					{
						gSession.LogInfo("Checking system requirements...");
						var systemRequirementResults = sysCheckPage.runSystemRequirementsCheck(gSession);
						var hasBlockingSystemRequirementError = false;

						if (systemRequirementResults)
						{
							if (systemRequirementResults[0] && (systemRequirementResults[0].length > 0))
							{
								hasBlockingSystemRequirementError = true;
								gSession.LogError("The minimum system requirements listed below are needed in order to run this Adobe Product and are not met.");
								for (var i=0; i<systemRequirementResults[0].length; i++)
								{
									gSession.LogError(" - " + this._stringForLog(systemRequirementResults[0][i])); 
								}
								gSession.LogError("Please upgrade or adjust your system to meet these minmum requirements and then restart the installer.");
							}
							
							if (systemRequirementResults[2] && (systemRequirementResults[2].length > 0))
							{
								hasBlockingSystemRequirementError = true;
								gSession.LogError("This Adobe Product cannot run on the systems listed below.");
								for (var i=0; i<systemRequirementResults[2].length; i++)
								{
									gSession.LogError(" - " + this._stringForLog(systemRequirementResults[2][i])); 
								}
								gSession.LogError("You must upgrade or adjust your system and then restart the installer.");
							}
							
							if (systemRequirementResults[1] && (systemRequirementResults[1].length > 0))
							{
								gSession.LogWarning("The minimum system requirements listed below are recommended in order to run Adobe Product properly and are not met: ");
								for (var i=0; i<systemRequirementResults[1].length; i++)
								{
									gSession.LogWarning(" - " + this._stringForLog(systemRequirementResults[1][i])); 
								}
								gSession.LogWarning("It is recommended that you upgrade or adjust your system to meet these minmum requirements and then restart the installer.");
							}
						}
					}
					*/

					// Manifest errors		
					gSession.LogInfo("Checking for manifest errors...");
					var manifestErrorCount = sysCheckPage.checkManifestErrors(gSession);

					if (manifestErrorCount > 0)
					{	
						gSession.LogError(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");		
						gSession.LogError("Manifest errors were found:");
						gSession.LogError("Number of payloads with errors: " + manifestErrorCount);
						gSession.LogError(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
					}

					if (hasBlockingAppConflict /* || hasBlockingSystemRequirementError*/)
					{
						throw "Exiting from installation due to blocking error."
					}
				}
				else
				{
					throw "Could not check for conflicting processes or system errors"
				}

				// --------------------------- Check for and report problems with the simulated install ---------------------------
				var sessionIsValid = true;
				var payloadErrors = new Array();
				
				_simulatePayloadOperations(gSession);

				// Report the results
				for (var anAdobeCode in gSession.sessionPayloads)
				{
					var aPayload = gSession.sessionPayloads[anAdobeCode];
					if (aPayload.GetOperationResult()
						&& aPayload.GetOperationResult().message
						&& aPayload.GetOperationResult().message.simulationResults)
					{
						var simulationResults = aPayload.GetOperationResult().message.simulationResults;
						for (var conflictIndex = 0; conflictIndex < simulationResults.conflicting.length; ++conflictIndex)
						{
							sessionIsValid = false;
							var conflictingAdobeCode = simulationResults.conflicting[conflictIndex];
							var conflictingPayload = gSession.allPayloads[conflictingAdobeCode];
							payloadErrors.push("critical", aPayload.GetProductName() + " cannot be installed alongside " + conflictingPayload.GetProductName());
						}
					}
					gSession.LogDebug(aPayload.GetOperationResult());
				}

				// Report any payload requirements that would not be met if the installation were to proceed
				var unsatisfiedRequirementsArray = gSession.AccumulateUnmetRequirements();
				for (var index = 0; index < unsatisfiedRequirementsArray.length; ++index)
				{
					sessionIsValid = false;
					var curRequirement = unsatisfiedRequirementsArray[index];
					payloadErrors.push("critical", curRequirement.owningPayload.GetProductName()	+ " requires " + curRequirement.productName	+ " to be installed.");
				}
				
				if(!sessionIsValid)
				{
					gSession.LogError("Found payload conflicts and errors:")
					for (var err = 0; err < payloadErrors.length; err++)
						gSession.LogError(" - " + payloadErrors[err]);
					
					throw "Conflicts were found in the selected payloads. Halting installation."
				}
				else
				{
					gSession.LogInfo("Payloads passed preflight validation.")
				}

				// --------------------------- Perform the install/repair/remove action ---------------------------
				gSession.StartPayloadOperations(this.operationCallback);
				
				// --------------------------- Find post-install errors and warnings ---------------------------
				// Walk through the payloads that were successfully installed | uninstalled | repaired and note their status	
				var totalPayloadsInstalled = 0;
				var totalPayloadsRepaired = 0;	
				var totalPayloadsRemoved = 0;		
				var totalPayloadErrors = 0;
				var payloadErrors = new Array();
				var payloadInstalls = new Array();
				var payloadRepairs = new Array();
				var payloadRemoves = new Array();

				for (adobeCode in gSession.sessionPayloads)
				{
					var p = gSession.sessionPayloads[adobeCode];
					var actionState = p.GetInstallerAction();
					var operationResult = p.GetOperationResult();

					if (actionState != kInstallerActionNone)
					{
						if (operationResult &&
							operationResult.message &&
							operationResult.message.code)
						{
							if (operationResult.message.code == kOpResultSuccess || operationResult.message.code == kOpResultSuccessWithReboot)
							{
								if (operationResult.message.code == kOpResultSuccessWithReboot)
									this.restartNeeded = true;
									
								switch (actionState)
								{
									case kInstallerActionInstall:
										totalPayloadsInstalled++;
										payloadInstalls.push(p.GetProductName());
										break;
									case kInstallerActionRepair:
										totalPayloadsRepaired++;
										payloadRepairs.push(p.GetProductName());
										break;
									case kInstallerActionRemove:
										totalPayloadsRemoved++;
										payloadRemoves.push(p.GetProductName());
										break;
									case kInstallerActionNone:
										// Do nothing
										break;
									default:
										gSession.LogError("Bad install state \"" + actionState + "\" for " + adobeCode);
										break;
								}
							}
							else
							{
								var errorMessage = "";
								switch (operationResult.message.code)
								{
									case gConstants.kORUserCancel:
										errorMessage = "User canceled installation";
										break;
									case gConstants.kORConflictsExist:
										errorMessage = "Conflicts with a component already installed";
										break;
									case gConstants.kORUpgradeFailure:
										errorMessage = "Upgrade failed";
										break;
									default:
										errorMessage = "Install failed";
										break;
								}
																
								payloadErrors.push(p.GetProductName() + ": " + errorMessage);
								totalPayloadErrors++;
							}
						}
						else
						{
							gSession.LogError("Payload " + adobeCode + " has an action \"" + actionState + "\" but no resultState");
						}
					}
				}
				
				// --------------------------- Uninstall the bootstrapper, if required ---------------------------
				if (this.bootstrapperInstalled && this.silentUninstallBootstrapper())
				{
					gSession.LogInfo("Ran uninstall for the bootstrapper");
					this.bootstrapperInstalled = false;
				}
				
				// --------------------------- Report the final results ---------------------------
				if (totalPayloadsInstalled > 0) 
				{
					gSession.LogInfo("Successfully installed " + totalPayloadsInstalled + " component" + ((totalPayloadsInstalled == 1) ? "" : "s") + ":");
					for (var msg = 0; msg < payloadInstalls.length; msg++)
						gSession.LogInfo(" - " + payloadInstalls[msg]);
				}
				else
				{
					gSession.LogInfo("Total components installed: 0");
				}

				if (totalPayloadsRepaired > 0)
				{
					gSession.LogInfo("Successfully repaired " + totalPayloadsRepaired + " component" + ((totalPayloadsRepaired == 1) ? "" : "s") + ":");
					for (var msg = 0; msg < payloadRepairs.length; msg++)
						gSession.LogInfo(" - " + payloadRepairs[msg]);
				}
				else
				{
					gSession.LogInfo("Total components repaired: 0");
				}

				if (totalPayloadsRemoved > 0)
				{
					gSession.LogInfo("Successfully removed " + totalPayloadsRemoved + " component" + ((totalPayloadsRemoved == 1) ? "" : "s") + ":");
					for (var msg = 0; msg < payloadRemoves.length; msg++)
						gSession.LogInfo(" - " + payloadRemoves[msg]);
				}
				else
				{
					gSession.LogInfo("Total components removed: 0");
				}	

				// Log the serial warnings
				if (this.payloadSerialWarnings && this.payloadSerialWarnings.length > 0)
				{
					gSession.LogWarning("The following payloads were not installed due to a missing serial number:");
					for (var msg = 0; msg < this.payloadSerialWarnings.length; msg++)
						gSession.LogWarning(" - " + this.payloadSerialWarnings[msg]);
				}

				// Log the payload errors
				if (totalPayloadErrors > 0)
				{
					gSession.LogError("The following payload errors were found during install:");
					for (var msg = 0; msg < payloadErrors.length; msg++)
						gSession.LogError(" - " + payloadErrors[msg]);

					// Return error to setup
					gSession.SetWorkflowExitCode("6");
				}
				
				// Note if restart is required
				if (this.restartNeeded || gSession.IsRestartNeeded())
				{
					gSession.LogInfo(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");		
					gSession.LogInfo("Restarting your computer is recommended:");
					gSession.LogInfo("In order to complete the installation, please restart the computer");
					gSession.LogInfo(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
				}
				
			} // Bootstrapper installed
		} 
		catch (ex)
		{
			// Uninstall the bootstrapper, if required
			if (this.bootstrapperInstalled && this.silentUninstallBootstrapper())
			{
				if (gSession)
					gSession.LogInfo("Ran uninstall for the bootstrapper due to an exception");
				this.bootstrapperInstalled = false;
			}
			
			if (gSession)
				this.logSessionErrors();
			
			if (this.inContainer)
			{
				// Log the general exception
				this.inContainer.LogFatal("Exception: " + ex);
				this.inContainer.LogFatal("Exit code: 7");
				this.inContainer.SetWorkflowExitCode("7"); 
			} 
		} 
		
		if (this.inContainer)
		{
			this.inContainer.LogInfo("-----------------------------------------------------------------");	
			this.inContainer.LogInfo("------------------ END Silent Installer Session -----------------");
			this.inContainer.LogInfo("-----------------------------------------------------------------");			
			this.inContainer.LogInfo(""); 			
		}
	} 
}

/** Silent Worfklow "main" */

var silentInstall = new SilentWorkflow();

silentInstall.runSilent();
