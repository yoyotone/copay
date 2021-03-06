import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ActionSheetController } from 'ionic-angular';

// native
import { SocialSharing } from '@ionic-native/social-sharing';

// providers
import { ActionSheetProvider } from '../../../../providers/action-sheet/action-sheet';
import { AppProvider } from '../../../../providers/app/app';
import { ConfigProvider } from '../../../../providers/config/config';
import { DownloadProvider } from '../../../../providers/download/download';
import { Logger } from '../../../../providers/logger/logger';
import { PersistenceProvider } from '../../../../providers/persistence/persistence';
import { PlatformProvider } from '../../../../providers/platform/platform';

import * as _ from 'lodash';

@Component({
  selector: 'page-session-log',
  templateUrl: 'session-log.html'
})
export class SessionLogPage {
  private config;

  public logOptions;
  public filteredLogs;
  public filterValue: number;
  public isCordova: boolean;

  constructor(
    private configProvider: ConfigProvider,
    private logger: Logger,
    private socialSharing: SocialSharing,
    private actionSheetCtrl: ActionSheetController,
    private persistenceProvider: PersistenceProvider,
    private platformProvider: PlatformProvider,
    private translate: TranslateService,
    private actionSheetProvider: ActionSheetProvider,
    private downloadProvider: DownloadProvider,
    private appProvider: AppProvider
  ) {
    this.config = this.configProvider.get();
    this.isCordova = this.platformProvider.isCordova;
    let logLevels = this.logger.getLevels();
    this.logOptions = _.keyBy(logLevels, 'weight');
  }

  ionViewDidLoad() {
    this.logger.info('ionViewDidLoad SessionLogPage');
  }

  ionViewWillEnter() {
    let selectedLevel = _.has(this.config, 'log.weight')
      ? this.logger.getWeight(this.config.log.weight)
      : this.logger.getDefaultWeight();
    this.filterValue = selectedLevel.weight;
    this.setOptionSelected(selectedLevel.weight);
    this.filterLogs(selectedLevel.weight);
  }

  private filterLogs(weight: number): void {
    this.filteredLogs = _.sortBy(
      this.logger.get(weight),
      'timestamp'
    ).reverse();
  }

  public setOptionSelected(weight: number): void {
    this.filterLogs(weight);
    let opts = {
      log: {
        weight
      }
    };
    this.configProvider.set(opts);
  }

  private preparePersistenceLogs(): Promise<string> {
    return new Promise((resolve, reject) => {
      let log: string =
        'Copay Session Logs\n Be careful, this could contain sensitive private data\n\n';
      log += '\n\n';

      this.persistenceProvider
        .getLogs()
        .then(logs => {
          Object.keys(logs).forEach(key => {
            log +=
              '[' +
              logs[key].timestamp +
              '][' +
              logs[key].level +
              ']' +
              logs[key].msg +
              '\n';
          });
          resolve(log);
        })
        .catch(err => {
          reject(err);
        });
    });
  }

  private sendLogs(): void {
    this.preparePersistenceLogs()
      .then(logs => {
        let now = new Date().toISOString();
        let subject: string = this.appProvider.info.nameCase + '-logs ' + now;

        let blob = new Blob([logs], { type: 'text/txt' });

        let reader = new FileReader();
        reader.onload = event => {
          let attachment = (event as any).target.result; // <-- data url

          this.socialSharing
            .shareViaEmail(
              'Copay Session Logs. Be careful, this could contain sensitive private data',
              subject,
              null, // TO: must be null or an array
              null, // CC: must be null or an array
              null, // BCC: must be null or an array
              attachment // FILES: can be null, a string, or an array
            )
            .then(data => {
              this.logger.info('Email sent with success: ', data);
            })
            .catch(err => {
              this.logger.error('socialSharing Error: ', err);
            });
        };

        reader.readAsDataURL(blob);
      })
      .catch(err => {
        this.logger.error(err);
      });
  }

  public showOptionsMenu(): void {
    let downloadText = this.translate.instant('Download logs');
    let emailText = this.translate.instant('Send logs by email');
    let button = [];

    if (this.isCordova) {
      button = [
        {
          text: emailText,
          handler: () => {
            this.showWarningModal();
          }
        }
      ];
    } else {
      button = [
        {
          text: downloadText,
          handler: () => {
            this.showWarningModal();
          }
        }
      ];
    }

    let actionSheet = this.actionSheetCtrl.create({
      title: '',
      buttons: button
    });
    actionSheet.present();
  }

  private showWarningModal(): void {
    const infoSheet = this.actionSheetProvider.createInfoSheet(
      'sensitive-info'
    );
    infoSheet.present();
    infoSheet.onDidDismiss(option => {
      if (option) this.isCordova ? this.sendLogs() : this.download();
    });
  }

  public download(): void {
    this.preparePersistenceLogs()
      .then(logs => {
        let now = new Date().toISOString();

        let filename = this.appProvider.info.nameCase + '-logs ' + now + '.txt';
        this.downloadProvider.download(logs, filename);
      })
      .catch(err => {
        this.logger.error(err);
      });
  }
}
